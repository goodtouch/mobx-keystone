import { action, createAtom, IAtom, observable, ObservableSet } from "mobx"
import { AnyModel } from "../model/BaseModel"
import { modelIdKey, modelTypeKey } from "../model/metadata"
import { isModel } from "../model/utils"
import { fastGetParent } from "./path"

const defaultObservableSetOptions = { deep: false }

interface ObjectChildrenData {
  shallow: ObservableSet<object>
  deep: ReadonlySet<object>
  deepByModelTypeAndId: ReadonlyMap<string, AnyModel>
  deepDirty: boolean
  deepAtom: IAtom
}

const objectChildren = new WeakMap<object, ObjectChildrenData>()

/**
 * @ignore
 * @internal
 */
export function initializeObjectChildren(node: object) {
  if (objectChildren.has(node)) {
    return
  }

  objectChildren.set(node, {
    shallow: observable.set(undefined, defaultObservableSetOptions),
    deep: new Set(),
    deepByModelTypeAndId: new Map(),
    deepDirty: true,
    deepAtom: createAtom("deepChildrenAtom"),
  })
}

/**
 * @ignore
 * @internal
 */
export function getObjectChildren(node: object) {
  return objectChildren.get(node)!.shallow
}

/**
 * @ignore
 * @internal
 */
export function getDeepObjectChildren(node: object) {
  const obj = objectChildren.get(node)!
  if (obj.deepDirty) {
    updateDeepObjectChildren(node)
  }
  obj.deepAtom.reportObserved()
  return { deep: obj.deep, deepByModelTypeAndId: obj.deepByModelTypeAndId }
}

function addNodeToDeepLists(
  node: any,
  deep: Set<object>,
  deepByModelTypeAndId: Map<string, AnyModel>
) {
  deep.add(node)
  if (isModel(node)) {
    deepByModelTypeAndId.set(byModelTypeAndIdKey(node[modelTypeKey], node[modelIdKey]), node)
  }
}

const updateDeepObjectChildren = action((node: object) => {
  const obj = objectChildren.get(node)!
  if (!obj.deepDirty) {
    return {
      deep: obj.deep,
      deepByModelTypeAndId: obj.deepByModelTypeAndId,
    }
  }

  const deep = new Set<object>()
  const deepByModelTypeAndId = new Map<string, AnyModel>()

  const childrenIter = getObjectChildren(node)!.values()
  let ch = childrenIter.next()
  while (!ch.done) {
    addNodeToDeepLists(ch.value, deep, deepByModelTypeAndId)

    const ret = updateDeepObjectChildren(ch.value).deep
    const retIter = ret.values()
    let retCur = retIter.next()
    while (!retCur.done) {
      addNodeToDeepLists(retCur.value, deep, deepByModelTypeAndId)
      retCur = retIter.next()
    }

    ch = childrenIter.next()
  }

  obj.deep = deep
  obj.deepByModelTypeAndId = deepByModelTypeAndId
  obj.deepDirty = false
  obj.deepAtom.reportChanged()
  return { deep, deepByModelTypeAndId }
})

/**
 * @ignore
 * @internal
 */
export const addObjectChild = action((node: object, child: object) => {
  const obj = objectChildren.get(node)!
  obj.shallow.add(child)

  invalidateDeepChildren(node)
})

/**
 * @ignore
 * @internal
 */
export const removeObjectChild = action((node: object, child: object) => {
  const obj = objectChildren.get(node)!
  obj.shallow.delete(child)

  invalidateDeepChildren(node)
})

function invalidateDeepChildren(node: object) {
  const obj = objectChildren.get(node)!

  if (!obj.deepDirty) {
    obj.deepDirty = true
    obj.deepAtom.reportChanged()
  }

  const parent = fastGetParent(node)
  if (parent) {
    invalidateDeepChildren(parent)
  }
}

/**
 * @ignore
 * @internal
 */
export function byModelTypeAndIdKey(modelType: string, modelId: string) {
  return modelType + " " + modelId
}
