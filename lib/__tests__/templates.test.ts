import { templates, getTemplateById } from '../templates';

describe('templates', () => {
  it('should export a non-empty templates array', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it('each template should have required fields', () => {
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.title).toBeTruthy();
      expect(Array.isArray(t.items)).toBe(true);
      expect(t.items.length).toBeGreaterThan(0);
    }
  });
});

describe('getTemplateById', () => {
  it('should return a template when found', () => {
    const template = getTemplateById('movies');
    expect(template).toBeDefined();
    expect(template?.id).toBe('movies');
    expect(template?.title).toBe('Top 10 Movies of All Time');
  });

  it('should return undefined for an unknown id', () => {
    const template = getTemplateById('nonexistent');
    expect(template).toBeUndefined();
  });

  it('should return correct items for a template', () => {
    const template = getTemplateById('pizza');
    expect(template?.items).toContain('Pepperoni');
  });
});
