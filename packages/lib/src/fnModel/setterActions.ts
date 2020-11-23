import { FnModelFn } from "./core"

/**
 * An array with functional model setter action definitions.
 */
export type FnModelSetterActionsArrayDef<Data> = ReadonlyArray<keyof Data & string>

/**
 * Array to functional model setter actions.
 */
export type FnModelSetterActionsArray<
  Data extends object,
  SetterActionsDef extends FnModelSetterActionsArrayDef<Data>
> = {
  [k in SetterActionsDef[number] as `set${Capitalize<k>}`]: FnModelFn<
    Data,
    (value: Data[k]) => void
  >
}
