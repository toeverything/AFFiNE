import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom'
import { rootStore } from '@toeverything/plugin-infra/manager'
import { useAtomValue } from 'jotai/react'
import { useParams } from 'react-router-dom'

export async function loader() {
  return rootStore.get(rootWorkspacesMetadataAtom)
}

export const Component = () => {
  const metadata = useAtomValue(rootWorkspacesMetadataAtom)
  return (
    <div>
      2
    </div>
  )
}
