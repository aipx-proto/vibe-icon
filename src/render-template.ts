/**
 * Render a text string template. The template may include {{ variableName }} placeholders that
 * will be replaced with the corresponding values from the provided context object.
 *
 * Note that the template will "Pull" values from the context, not the other way around.
 * It will throw error if a variable is missing from the context.
 * Unused variables in the context object will be ignored.
 */
export function renderTemplate(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, variableName) => {
    if (!(variableName in context)) {
      throw new Error(`Variable "${variableName}" is missing from context`);
    }
    return String(context[variableName]);
  });
}
