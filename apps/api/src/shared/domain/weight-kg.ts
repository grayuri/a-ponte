import { Decimal } from '@prisma/client/runtime/library';

/**
 * Peso colhido. Existe como valor porque a operação inteira é medida em kg e
 * a planilha somava `Decimal` como texto em alguns pontos. Aqui o arredondamento
 * é decidido uma vez: duas casas, meio pra cima.
 */
export class WeightKg {
  private constructor(private readonly value: number) {}

  static of(input: number | string | Decimal): WeightKg {
    const n = typeof input === 'number' ? input : Number(input.toString());

    if (!Number.isFinite(n)) throw new Error(`Peso inválido: "${String(input)}".`);
    if (n < 0) throw new Error('Peso não pode ser negativo.');
    if (n > 100_000) throw new Error('Peso acima do limite operacional (100.000 kg).');

    return new WeightKg(Math.round(n * 100) / 100);
  }

  static zero(): WeightKg {
    return new WeightKg(0);
  }

  static sum(values: Array<number | string | Decimal>): WeightKg {
    return values.reduce<WeightKg>((acc, v) => acc.plus(WeightKg.of(v)), WeightKg.zero());
  }

  plus(other: WeightKg): WeightKg {
    return WeightKg.of(this.value + other.value);
  }

  toNumber(): number {
    return this.value;
  }

  toString(): string {
    return this.value.toFixed(2);
  }

  /** "1.234,5 kg" — como aparece nos painéis e nas mensagens. */
  toBrLabel(): string {
    return `${this.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
  }
}

/** Converte o Decimal do Prisma para número simples nas camadas de leitura. */
export function decimalToNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}
