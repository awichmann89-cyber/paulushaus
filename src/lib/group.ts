import type { GroupView, RoomView } from './calendar';

/** Räume in der vorgegebenen Reihenfolge nach Gruppen bündeln */
export function groupOf(list: RoomView[]): GroupView[] {
  const out: GroupView[] = [];
  for (const r of list) {
    const key = r.groupId ?? -1;
    let g = out.find((x) => x.id === key);
    if (!g) { g = { id: key, name: r.groupName, rooms: [] }; out.push(g); }
    g.rooms.push(r);
  }
  return out;
}
