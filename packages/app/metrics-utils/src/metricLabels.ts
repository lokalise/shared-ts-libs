/**
 * Label map shape accepted by a `@prometheus-io/client` metric whose label names are typed as `string`.
 *
 * The client types every label-values parameter as a conditional type keyed on the metric's label-name
 * union. TypeScript leaves that conditional unresolved while the union is still a generic parameter, so
 * a label map assembled at runtime cannot be handed to a `Counter<TLabels[number]>` directly. The metrics
 * in this package are all generic over their label names, so each call site widens the metric to its
 * `string`-labelled instantiation, where the conditional resolves to this type.
 */
export type StringLabelValues = Partial<Record<string, string | number>>
