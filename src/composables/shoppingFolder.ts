import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useListStore } from '@/stores/list'

/** Every folder at once, grouped. */
export const ALL_FOLDERS = 'all'
/** One folder by id, «General» (null) or all of them. */
export type FolderView = string | null

// In the URL: ?carpeta=todas, ?carpeta=general or ?carpeta=<id>.
const ALL_QUERY = 'todas'
const GENERAL_QUERY = 'general'

/**
 * The folder the shopping list (and shopping mode) shows, kept in the URL like the other views'
 * state. Without one in the URL, the folder I last added something to.
 */
export function useFolderView() {
  const route = useRoute()
  const router = useRouter()
  const list = useListStore()

  const view = computed<FolderView>(() => {
    const q = route.query.carpeta
    if (q === ALL_QUERY) return ALL_FOLDERS
    if (q === GENERAL_QUERY) return null
    if (typeof q === 'string' && list.folders.some((f) => f.id === q)) return q
    return list.myLastFolderId
  })

  /** Where new things go: the folder shown, or my default while showing all of them. */
  const target = computed<string | null>(() => (view.value === ALL_FOLDERS ? list.myLastFolderId : view.value))

  /** The query that keeps this view, for links to the other shopping screens. */
  const query = computed(() => ({
    carpeta: view.value === ALL_FOLDERS ? ALL_QUERY : (view.value ?? GENERAL_QUERY),
  }))

  function show(folder: FolderView) {
    void router.replace({
      query: { ...route.query, carpeta: folder === ALL_FOLDERS ? ALL_QUERY : (folder ?? GENERAL_QUERY) },
    })
  }

  return { view, target, query, show }
}
