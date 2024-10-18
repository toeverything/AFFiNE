const reWeburl =
  /\b((?:(?:https?|mailto|ftp):(?:\/{2}|[a-z0-9%])|www\d{0,3}[.]|(?:[a-z0-9-]+[.])+[a-z]{2,4}\/|localhost)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()[\]{};:'".,<>?«»。“，【】「」《》“”‘’]))/gi;

export const matchUrl = (text: string) => {
  return text.matchAll(reWeburl);
};
