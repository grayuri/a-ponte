import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/**
 * Leitor mínimo de .xlsx, sem dependência externa.
 *
 * Um .xlsx é um zip de XMLs. Precisamos ler UMA planilha, UMA vez, para trazer
 * o histórico de 2026 — puxar uma biblioteca de leitura de Excel inteira para
 * isso, num backend que nunca mais vai abrir uma planilha, seria peso morto no
 * container em produção.
 *
 * Escopo consciente: lê arquivos deflate/stored, valores de célula e strings
 * compartilhadas. NÃO avalia fórmulas — lê o último valor calculado que o Excel
 * gravou, que é exatamente o que queremos do histórico. Não lida com zip64.
 */

interface ZipEntry {
  name: string;
  data: Buffer;
}

function readZip(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();

  // Varre os cabeçalhos locais (PK\x03\x04) direto, em vez do índice central:
  // é suficiente porque só lemos, nunca escrevemos de volta.
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const flags = buffer.readUInt16LE(offset + 6);
    let compressedSize = buffer.readUInt32LE(offset + 18);
    let uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = buffer.toString('utf8', nameStart, nameStart + nameLength);
    const dataStart = nameStart + nameLength + extraLength;

    // Bit 3: tamanhos vão num descritor DEPOIS dos dados. Nesse caso é preciso
    // procurar a assinatura do descritor para saber onde o bloco termina.
    if (flags & 0x08 && compressedSize === 0) {
      const marker = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x07, 0x08]), dataStart);
      if (marker < 0) break;
      compressedSize = marker - dataStart;
      uncompressedSize = buffer.readUInt32LE(marker + 12);
    }

    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = compressionMethod === 0 ? raw : inflateRawSync(raw);

    entries.set(name, data);

    offset = dataStart + compressedSize + (flags & 0x08 ? 16 : 0);
  }

  if (!entries.size) {
    throw new Error('Arquivo não parece ser um .xlsx válido (nenhuma entrada zip encontrada).');
  }

  return entries;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = '';
    for (const t of si[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += t[1]!;
    out.push(decodeXmlText(text));
  }
  return out;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const char of letters) n = n * 26 + (char.charCodeAt(0) - 64);
  return n - 1;
}

export interface SheetRow {
  rowNumber: number;
  cells: Array<string | null>;
}

export class XlsxWorkbook {
  private constructor(
    private readonly entries: Map<string, Buffer>,
    private readonly sharedStrings: string[],
    readonly sheets: Array<{ name: string; path: string }>,
  ) {}

  static open(filePath: string): XlsxWorkbook {
    const entries = readZip(readFileSync(filePath));

    const sharedStringsXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
    const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];

    const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
    const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';

    const targets = new Map<string, string>();
    for (const rel of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
      const attrs = rel[1]!;
      const id = /Id="([^"]+)"/.exec(attrs)?.[1];
      const target = /Target="([^"]+)"/.exec(attrs)?.[1];
      if (id && target) targets.set(id, target.replace(/^\/?xl\//, ''));
    }

    const sheets: Array<{ name: string; path: string }> = [];
    for (const sheet of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
      const attrs = sheet[1]!;
      const name = /name="([^"]*)"/.exec(attrs)?.[1];
      const rid = /r:id="([^"]+)"/.exec(attrs)?.[1];
      const target = rid ? targets.get(rid) : undefined;
      if (name && target) sheets.push({ name: decodeXmlText(name), path: `xl/${target}` });
    }

    return new XlsxWorkbook(entries, sharedStrings, sheets);
  }

  /** Percorre as linhas de uma aba sem materializar o arquivo inteiro em objetos. */
  *rows(sheetName: string): Generator<SheetRow> {
    const sheet = this.sheets.find((s) => s.name === sheetName);
    if (!sheet) {
      throw new Error(
        `Aba "${sheetName}" não encontrada. Abas disponíveis: ${this.sheets.map((s) => s.name).join(', ')}`,
      );
    }

    const xml = this.entries.get(sheet.path)?.toString('utf8');
    if (!xml) throw new Error(`Conteúdo da aba "${sheetName}" não encontrado no arquivo.`);

    for (const rowMatch of xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowNumber = Number(rowMatch[1]);
      const cells: Array<string | null> = [];

      for (const cellMatch of rowMatch[2]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cellMatch[1]!;
        const body = cellMatch[2] ?? '';

        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        if (!ref) continue;

        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        const inlineString = /<is>([\s\S]*?)<\/is>/.exec(body)?.[1];

        let value: string | null = null;
        if (type === 's' && rawValue != null) {
          value = this.sharedStrings[Number(rawValue)] ?? null;
        } else if (type === 'inlineStr' && inlineString) {
          const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inlineString)?.[1] ?? '';
          value = decodeXmlText(t);
        } else if (rawValue != null) {
          value = decodeXmlText(rawValue);
        }

        cells[columnIndex(ref)] = value;
      }

      yield { rowNumber, cells };
    }
  }
}

/**
 * O Excel guarda data como número de dias desde 30/12/1899 (com o famoso bug
 * do ano bissexto de 1900 embutido na contagem). Converte para AAAA-MM-DD.
 */
export function excelSerialToDateOnly(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Fração do dia (0.6458…) para HH:mm. */
export function excelFractionToTime(fraction: number): string {
  const totalMinutes = Math.round((fraction % 1) * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
