import { TwilioMessageGateway } from './twilio-message.gateway';

/** ConfigService de mentira, só com o `get` que o adaptador usa. */
function configFalso(valores: Record<string, unknown>) {
  return { get: (chave: string) => valores[chave] } as never;
}

const base = {
  TWILIO_ACCOUNT_SID: 'ACxxxxxxxx',
  TWILIO_AUTH_TOKEN: 'token-secreto',
  TWILIO_WHATSAPP_FROM: '+14155238886',
  NOTIFICATIONS_DRY_RUN: false,
};

describe('TwilioMessageGateway', () => {
  const fetchOriginal = global.fetch;
  let chamada: { url: string; corpo: URLSearchParams; headers: Record<string, string> } | null;

  beforeEach(() => {
    chamada = null;
    global.fetch = (async (url: string, init: RequestInit) => {
      chamada = {
        url,
        corpo: new URLSearchParams(String(init.body)),
        headers: init.headers as Record<string, string>,
      };
      return {
        ok: true,
        json: async () => ({ sid: 'SM123', status: 'queued' }),
      };
    }) as never;
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  it('não envia para grupo — a API oficial do WhatsApp é só 1:1', () => {
    const gateway = new TwilioMessageGateway(configFalso(base));
    expect(gateway.supportsGroups).toBe(false);
  });

  it('prefixa o destino com o canal que o Twilio exige', async () => {
    const gateway = new TwilioMessageGateway(configFalso(base));
    await gateway.send({ to: '+5585999998888', body: 'Olá' });

    expect(chamada!.corpo.get('To')).toBe('whatsapp:+5585999998888');
    expect(chamada!.corpo.get('From')).toBe('whatsapp:+14155238886');
  });

  it('não duplica o prefixo se o número já vier com ele', async () => {
    const gateway = new TwilioMessageGateway(configFalso(base));
    await gateway.send({ to: 'whatsapp:+5585999998888', body: 'Olá' });

    expect(chamada!.corpo.get('To')).toBe('whatsapp:+5585999998888');
  });

  it('manda texto livre quando não há template configurado para o tipo', async () => {
    const gateway = new TwilioMessageGateway(configFalso(base));
    await gateway.send({ to: '+5585999998888', body: 'Corpo livre', metadata: { kind: 'ESCALA_DO_DIA' } });

    expect(chamada!.corpo.get('Body')).toBe('Corpo livre');
    expect(chamada!.corpo.get('ContentSid')).toBeNull();
  });

  it('usa o template aprovado quando há Content SID para aquele tipo', async () => {
    const gateway = new TwilioMessageGateway(
      configFalso({ ...base, TWILIO_CONTENT_SID_ESCALA: 'HX999' }),
    );

    await gateway.send({
      to: '+5585999998888',
      body: 'texto montado, ignorado quando há template',
      metadata: { kind: 'ESCALA_DO_DIA', templateVars: { '1': 'Karen', '2': '02/08/2026' } },
    });

    expect(chamada!.corpo.get('ContentSid')).toBe('HX999');
    expect(JSON.parse(chamada!.corpo.get('ContentVariables')!)).toEqual({
      '1': 'Karen',
      '2': '02/08/2026',
    });
    // Fora da janela de 24h o Body seria recusado; com template ele não vai.
    expect(chamada!.corpo.get('Body')).toBeNull();
  });

  it('escolhe o template pelo tipo da mensagem, não por um só global', async () => {
    const gateway = new TwilioMessageGateway(
      configFalso({
        ...base,
        TWILIO_CONTENT_SID_ESCALA: 'HX-escala',
        TWILIO_CONTENT_SID_COBRANCA: 'HX-cobranca',
      }),
    );

    await gateway.send({ to: '+55859', body: 'x', metadata: { kind: 'COBRANCA_PENDENCIA' } });
    expect(chamada!.corpo.get('ContentSid')).toBe('HX-cobranca');
  });

  it('prefere o Messaging Service ao remetente avulso', async () => {
    const gateway = new TwilioMessageGateway(
      configFalso({ ...base, TWILIO_MESSAGING_SERVICE_SID: 'MG123' }),
    );

    await gateway.send({ to: '+5585999998888', body: 'Olá' });
    expect(chamada!.corpo.get('MessagingServiceSid')).toBe('MG123');
    expect(chamada!.corpo.get('From')).toBeNull();
  });

  it('não envia nada em modo seco, mesmo com credenciais válidas', async () => {
    const gateway = new TwilioMessageGateway(
      configFalso({ ...base, NOTIFICATIONS_DRY_RUN: true }),
    );

    const r = await gateway.send({ to: '+5585999998888', body: 'Olá' });
    expect(chamada).toBeNull();
    expect(r.delivered).toBe(true);
    expect(r.providerMessageId).toBe('dry-run');
  });

  it('explica o erro 63016 em vez de repassar o texto cru do Twilio', async () => {
    global.fetch = (async () => ({
      ok: false,
      json: async () => ({ code: 63016, message: 'outside the allowed window' }),
    })) as never;

    const gateway = new TwilioMessageGateway(configFalso(base));
    const r = await gateway.send({ to: '+55859', body: 'x', metadata: { kind: 'ESCALA_DO_DIA' } });

    expect(r.delivered).toBe(false);
    expect(r.error).toMatch(/janela de 24 horas/i);
    expect(r.error).toMatch(/ESCALA_DO_DIA/);
    expect(r.error).toMatch(/Content Template Builder/);
  });

  it('trata falha de rede como não entregue, sem derrubar o processo', async () => {
    global.fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as never;

    const gateway = new TwilioMessageGateway(configFalso(base));
    const r = await gateway.send({ to: '+55859', body: 'x' });

    expect(r.delivered).toBe(false);
    expect(r.error).toBe('ECONNRESET');
  });
});
