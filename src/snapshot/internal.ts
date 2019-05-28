import produce from "immer"
import { createAtom, IAtom, transaction } from "mobx"
import { getParentPath, ParentPath } from "../parent"
import { PatchRecorder } from "../patch/emitPatch"
import { debugFreeze, failure } from "../utils"

interface SnapshotData<T extends object> {
  standard: T
  readonly atom: IAtom
}

const snapshots = new WeakMap<Object, SnapshotData<any>>()

export function getInternalSnapshot<T extends object>(
  value: T
): Readonly<SnapshotData<T>> | undefined {
  return snapshots.get(value) as any
}

function getInternalSnapshotParent(
  sn: SnapshotData<any>,
  parentPath: ParentPath<any> | undefined
): { parentSnapshot: SnapshotData<any>; parentPath: ParentPath<any> } | undefined {
  if (!parentPath) {
    return undefined
  }

  const parentSn = getInternalSnapshot(parentPath.parent)
  if (!parentSn) {
    return undefined
  }

  if (sn === parentSn) {
    // linked snapshot, skip
    return getInternalSnapshotParent(parentSn, getParentPath(parentPath.parent, false))
  }

  return sn
    ? {
        parentSnapshot: parentSn,
        parentPath: parentPath,
      }
    : undefined
}

export function setInternalSnapshot<T extends object>(
  value: any,
  standard: T,
  patchRecorder: PatchRecorder | undefined
) {
  const oldSn = getInternalSnapshot(value) as SnapshotData<any>

  // do not actually update if not needed
  if (oldSn && oldSn.standard === standard) {
    if (process.env.NODE_ENV !== "production") {
      if (
        patchRecorder &&
        (patchRecorder.patches.length > 0 || patchRecorder.invPatches.length > 0)
      ) {
        throw failure(
          "assertion error: the snapshot did not change yet there were patches generated"
        )
      }
    }
    return
  }

  debugFreeze(standard)

  let sn: SnapshotData<any>
  if (oldSn) {
    sn = oldSn
    sn.standard = standard
  } else {
    sn = {
      standard,
      atom: createAtom("snapshot"),
    }

    snapshots.set(value, sn)
  }

  transaction(() => {
    sn.atom.reportChanged()

    if (patchRecorder) {
      patchRecorder.emit(value)
    }

    // also update parent(s) snapshot(s) if needed
    const parent = getInternalSnapshotParent(oldSn, getParentPath(value, false))
    if (parent) {
      const { parentSnapshot, parentPath } = parent
      // might be false in the cases where the parent has not yet been created
      if (parentSnapshot) {
        const path = parentPath.path

        const parentStandard = produce(parentSnapshot.standard, (draftStandard: any) => {
          draftStandard[path] = sn.standard
        })

        // patches for parent changes should not be emitted
        setInternalSnapshot(parentPath.parent, parentStandard, undefined)
      }
    }
  })
}

export function linkInternalSnapshot(value: object, snapshot: Readonly<SnapshotData<any>>) {
  snapshots.set(value, snapshot)
}

export function unlinkInternalSnapshot(value: object) {
  return snapshots.delete(value)
}

export function reportInternalSnapshotObserved(sn: Readonly<SnapshotData<any>>) {
  sn.atom.reportObserved()
}