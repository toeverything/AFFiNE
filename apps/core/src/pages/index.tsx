import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom'
import { rootStore } from '@toeverything/plugin-infra/manager'
import { useAtomValue } from 'jotai/react'

export async function loader() {
  return rootStore.get(rootWorkspacesMetadataAtom)
}

export const Component = () => {
  const metadata = useAtomValue(rootWorkspacesMetadataAtom)
  return (
    <div>
    </div>
  )
}
