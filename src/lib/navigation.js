import { matchPath } from 'react-router-dom'

// A section's detail pages retain its highlight, while a more specific menu
// entry takes precedence over its parent (for example warranty claims/assets).
export function currentNavigationItem(pathname, groups) {
  return groups.flatMap(group => group.items).reduce((current, item) => {
    const matches = matchPath({ path: item.path, end: item.path === '/' }, pathname)
    return matches && (!current || item.path.length > current.path.length) ? item : current
  }, undefined)
}
