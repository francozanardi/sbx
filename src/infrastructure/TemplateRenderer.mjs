import { SbxError } from '../domain/SbxError.mjs';

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Fills `${NAME}` placeholders in a template with the values a sandbox
 * resolved for itself.
 *
 * An unknown placeholder is an error rather than an empty string: a
 * rendered file with a silently blank credential fails much later and much
 * further from its cause than a refused render does.
 */
export class TemplateRenderer {
  render(template, variables) {
    const missing = new Set();
    const rendered = template.replace(PLACEHOLDER, (_match, name) => {
      const value = variables[name];
      if (value === undefined) {
        missing.add(name);
        return '';
      }
      return String(value);
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
