/**
 * Erros de domínio. Não conhecem HTTP — quem traduz para status é o filtro na
 * borda. Assim a regra de negócio continua testável fora de um controller.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Recurso não existe (ou o solicitante não deveria saber que existe). */
export class NotFoundError extends DomainError {
  readonly code = 'NAO_ENCONTRADO';

  constructor(entity: string, id?: string) {
    super(id ? `${entity} não encontrado(a): ${id}` : `${entity} não encontrado(a).`);
  }
}

/** A operação fere uma invariante do negócio. */
export class BusinessRuleError extends DomainError {
  readonly code = 'REGRA_DE_NEGOCIO';
}

/** Já existe algo equivalente — nome de loja repetido, colheita duplicada. */
export class ConflictError extends DomainError {
  readonly code = 'CONFLITO';
}

/** Autenticado, mas sem permissão para este recurso. */
export class ForbiddenError extends DomainError {
  readonly code = 'SEM_PERMISSAO';

  constructor(message = 'Você não tem permissão para esta operação.') {
    super(message);
  }
}

/** Entrada malformada que escapou da validação de borda. */
export class ValidationError extends DomainError {
  readonly code = 'ENTRADA_INVALIDA';
}
