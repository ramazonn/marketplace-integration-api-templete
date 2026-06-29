import { FailToMatchError, MatchEmptyError, RequirementError } from '@ubaytools/core';

export class JoiService {
  async handle(error: any) {
    console.error(error);
    let label, errorType = '';
    if (error?.details?.length) {
       label = error?.details[0]?.context?.label;
       errorType = error?.details[0]?.type;
    }

    switch (errorType) {
      // TODO enter all JOI errors
      case 'any.required':
        return new RequirementError(label);
      case 'string.pattern.base':
        return new FailToMatchError(label);
      case 'string.empty':
        return new MatchEmptyError(label);
      default:
        return new FailToMatchError(label);
    }
  }
}
