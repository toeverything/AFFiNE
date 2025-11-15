package app.affine.pro

enum class Prompt(val value: String) {
    Summary("Summary"),
    ExplainThis("Explain this"),
    WriteAnArticleAboutThis("Write an article about this"),
    WriteATwitterAboutThis("Write a twitter about this"),
    WriteAPoemAboutThis("Write a poem about this"),
    WriteABlogPostAboutThis("Write a blog post about this"),
    WriteOutline("Write outline"),
    ChangeToneTo("Change tone to"),
    ImproveWritingForIt("Improve writing for it"),
    ImproveGrammarForIt("Improve grammar for it"),
    FixSpellingForIt("Fix spelling for it"),
    CreateHeadings("Create headings"),
    MakeItLonger("Make it longer"),
    MakeItShorter("Make it shorter"),
    ContinueWriting("Continue writing"),
    ChatWithAFFiNEAI("Chat With AFFiNE AI"),
}