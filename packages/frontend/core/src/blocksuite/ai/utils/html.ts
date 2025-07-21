export function preprocessHtml(answer: string) {
  return answer;
  const start = answer.indexOf('<!DOCTYPE html>');
  const end = answer.indexOf('</html>');
  return answer.slice(start, end + '</html>'.length);
}
