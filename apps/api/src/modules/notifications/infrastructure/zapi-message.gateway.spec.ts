import { ZapiMessageGateway } from './zapi-message.gateway';

function configFalso(valores: Record<string, unknown>) {
  return { get: (chave: string) => valores[chave] } as never;
}

const base = {
  ZAPI_INSTANCE_ID: 'INST123',
  ZAPI_INSTANCE_TOKEN: 'TOK456',
  ZAPI_CLIENT_TOKEN: 'CLIENT789',
  ZAPI_DELAY_SECONDS: 2,
  NOTIFICATIONS_DRY_RUN: false,
};

describe('ZapiMessageGateway', () => {
  const fetchOriginal = global.fetch;
  let chamada: { url: string; corpo: Record<string, unknown>; headers: Record<string, string> } | null;

  beforeEach(() => {
    chamada = null;
    global.fetch = (async (url: string, init: RequestInit = {}) => {
      chamada = {
        url,
        corpo: init.body ? JSON.parse(String(init.body)) : {},
        headers: (init.headers ?? {}) as Record<string, string>,
      };
      return { ok: true, json: async () => ({ messageId: 'MSG1', zaapId: 'Z1' }) };
    }) as never;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('envia para grupo — é o que destrava usar os grupos que já existem', () => {
    const gateway = new ZapiMessageGateway(configFalso(base));
    expect(gateway.supportsGroups).toBe(true);
  });

  it('converte E.164 para só dígitos, como o Z-API espera', async () => {
    const gateway = new ZapiMessageGateway(configFalso(base));
    await gateway.send({ to: '+55 (85) 99999-8888', body: 'Olá' });

    expect(chamada!.corpo.phone).toBe('5585999998888');
    expect(chamada!.corpo.message).toBe('Olá');
  });

  it('preserva o id do grupo intacto, sem tirar os caracteres', async () => {
    const gateway = new ZapiMessageGateway(configFalso(base));
    await gateway.send({ to: '120363019502650977-group', body: 'Escala de hoje' });

    // Se passasse pelo replace de dígitos, o "-group" sumiria e a mensagem
    // iria para um número inexistente.
    expect(chamada!.corpo.phone).toBe('120363019502650977-group');
  });

  it('preserva o formato @g.us de grupo', async () => {
    const gateway = new ZapiMessageGateway(configFalso(base));
    await gateway.send({ to: '120363019502650977@g.us', body: 'x' });

    expect(chamada!.corpo.phone).toBe('120363019502650977@g.us');
  });

  it('manda o client-token, que é exigido separado do token da instância', async () => {
    const gateway = new ZapiMessageGateway(configFalso(base));
    await gateway.send({ to: '+5585999998888', body: 'Olá' });

    expect(chamada!.headers['client-token']).toBe('CLIENT789');
    expect(chamada!.url).toContain('/instances/INST123/token/TOK456/send-text');
  });

  it('aplica a pausa entre mensagens contra bloqueio', async () => {
    const gateway = new ZapiMessageGateway(configFalso(base));
    await gateway.send({ to: '+5585999998888', body: 'Olá' });

    expect(chamada!.corpo.delayMessage).toBe(2);
  });

  it('omite a pausa quando configurada como zero', async () => {
    const gateway = new ZapiMessageGateway(configFalso({ ...base, ZAPI_DELAY_SECONDS: 0 }));
    await gateway.send({ to: '+5585999998888', body: 'Olá' });

    expect(chamada!.corpo.delayMessage).toBeUndefined();
  });

  it('não envia nada em modo seco', async () => {
    const gateway = new ZapiMessageGateway(configFalso({ ...base, NOTIFICATIONS_DRY_RUN: true }));
    const r = await gateway.send({ to: '+5585999998888', body: 'Olá' });

    expect(chamada).toBeNull();
    expect(r.providerMessageId).toBe('dry-run');
  });

  describe('erros', () => {
    const responder = (status: number, corpo: unknown) => {
      global.fetch = (async () => ({ ok: false, status, json: async () => corpo })) as never;
    };

    it('aponta o client-token no 403, que é o engano mais comum', async () => {
      responder(403, { error: 'unauthorized' });
      const gateway = new ZapiMessageGateway(configFalso(base));
      const r = await gateway.send({ to: '+55859', body: 'x' });

      expect(r.delivered).toBe(false);
      expect(r.error).toMatch(/ZAPI_CLIENT_TOKEN/);
    });

    it('manda ler o QR Code quando a instância está desconectada', async () => {
      responder(405, { error: 'instance disconnected' });
      const gateway = new ZapiMessageGateway(configFalso(base));
      const r = await gateway.send({ to: '+55859', body: 'x' });

      expect(r.error).toMatch(/QR Code/i);
    });

    it('trata falha de rede sem derrubar o processo', async () => {
      global.fetch = (async () => {
        throw new Error('ETIMEDOUT');
      }) as never;

      const gateway = new ZapiMessageGateway(configFalso(base));
      const r = await gateway.send({ to: '+55859', body: 'x' });

      expect(r.delivered).toBe(false);
      expect(r.error).toBe('ETIMEDOUT');
    });
  });

  describe('status da sessão', () => {
    it('reporta conectado quando a instância responde ok', async () => {
      global.fetch = (async () => ({
        ok: true,
        json: async () => ({ connected: true, smartphoneConnected: true }),
      })) as never;

      const gateway = new ZapiMessageGateway(configFalso(base));
      expect(await gateway.status()).toEqual({ connected: true });
    });

    it('explica o que fazer quando a sessão caiu', async () => {
      global.fetch = (async () => ({
        ok: true,
        json: async () => ({ connected: false }),
      })) as never;

      const gateway = new ZapiMessageGateway(configFalso(base));
      const s = await gateway.status();

      expect(s.connected).toBe(false);
      expect(s.detail).toMatch(/QR Code/i);
    });

    it('avisa quando o celular do número está offline — a sessão morre depois disso', async () => {
      global.fetch = (async () => ({
        ok: true,
        json: async () => ({ connected: true, smartphoneConnected: false }),
      })) as never;

      const gateway = new ZapiMessageGateway(configFalso(base));
      const s = await gateway.status();

      expect(s.connected).toBe(true);
      expect(s.detail).toMatch(/celular/i);
    });

    it('não quebra quando a instância nem foi configurada', async () => {
      const gateway = new ZapiMessageGateway(
        configFalso({ ...base, ZAPI_INSTANCE_ID: '', ZAPI_INSTANCE_TOKEN: '' }),
      );
      const s = await gateway.status();

      expect(s.connected).toBe(false);
      expect(s.detail).toMatch(/não configurada/i);
    });
  });
});
