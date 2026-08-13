import { SbxError } from '@/domain/SbxError.js';

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export type TemplateVariables = Record<string, string>;

/**
 * Fills `${NAME}` placeholders in a template with the values a sandbox
 * resolved for itself.
 *
 * An unknown placeholder is an error rather than an empty string: a
 * rendered file with a silently blank credential fails much later and much
 * further from its cause than a refused render does.
 */
export class TemplateRenderer {
  render(template: string, variables: TemplateVariables): string {
    const missing = new Set<string>();
    const rendered = template.replace(PLACEHOLDER, (_match, rawName: string) => {
      const value = variables[rawName];
      if (value === undefined) {
        missing.add(rawName);
        return '';
      }
      return value;
    });
    if (missing.size > 0) {
      throw new SbxError(
        `Template refers to values that are not defined: ${[...missing].join(', ')}.`,
        'Each name must come from the secrets file, `variables`, `generate`, or the port block. Add the missing ones, empty if the feature that reads them is off.',
      );
    }
    return rendered;
  }
}
