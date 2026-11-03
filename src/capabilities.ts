export const capabilityNames = ['read', 'workspace', 'coding'] as const;
export type Capability = typeof capabilityNames[number];

export function capabilities(value: unknown = ['read']): Capability[] {
  if (!Array.isArray(value) || value.length > 32 || value.some(v => !capabilityNames.includes(v))) throw new Error('invalid_capabilities');
  return [...new Set(value as Capability[])].sort();
}

export function capabilityTools(selection: readonly Capability[]): string[] {
  if (selection.includes('coding')) return ['read', 'write', 'edit', 'bash'];
  if (selection.includes('workspace')) return ['read', 'write', 'edit'];
  return selection.includes('read') ? ['read'] : [];
}
