/** Shown with every statistic that depends on the total number of questions. */
export const NOBODY_NOTE = 'Tato statistika je přesná jen tehdy, když se u neuhodnutých otázek mačká tlačítko „Nikdo“.'

/** „1 otázka“, „3 otázky“, „5 otázek“ */
export function questionsPhrase(count: number): string {
  if (count === 1) return '1 otázka'
  if (count >= 2 && count <= 4) return `${count} otázky`
  return `${count.toLocaleString('cs-CZ')} otázek`
}
