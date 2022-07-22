export type BibTexArticle = {
    entry: 'article';
    author: string;
    title: string;
    journal: string;
    year: string;
    volume?: string;
    number?: string;
    pages?: string;
    month?: string;
    note?: string;
};

export type BibTexBook = {
    entry: 'book';
    author: string;
    editor?: string;
    title: string;
    publisher: string;
    year: string;
    volume?: string;
    number?: string;
    series?: string;
    address?: string;
    edition?: string;
    month?: string;
    note?: string;
};

export type BibTexBooklet = {
    entry: 'booklet';
    title: string;
    author?: string;
    howpublished?: string;
    address?: string;
    month?: string;
    year?: string;
    note?: string;
};

export type BibTexConference = {
    entry: 'conference' | 'inproceedings';
    author: string;
    title: string;
    booktitle: string;
    year: string;
    editor?: string;
    volume?: string;
    number?: string;
    series?: string;
    pages?: string;
    address?: string;
    month?: string;
    organization?: string;
    publisher?: string;
    note?: string;
};

export type BibTexInBook = {
    entry: 'inbook';
    author: string;
    editor: string;
    title: string;
    chapter: string;
    pages?: string;
    publisher: string;
    year: string;
    volume?: string;
    number?: string;
    series?: string;
    type?: string;
    address?: string;
    edition?: string;
    month?: string;
    note?: string;
};

export type BibTexInCollection = {
    entry: 'incollection';
    author: string;
    title: string;
    booktitle: string;
    publisher: string;
    year: string;
    editor?: string;
    volume?: string;
    number?: string;
    series?: string;
    type?: string;
    chapter?: string;
    pages?: string;
    address?: string;
    edition?: string;
    month?: string;
    note?: string;
};

export type BibTexManual = {
    entry: 'manual';
    title: string;
    author?: string;
    organization?: string;
    address?: string;
    edition?: string;
    month?: string;
    year?: string;
    note?: string;
};

export type BibTexMastersThesis = {
    entry: 'mastersthesis';
    author: string;
    title: string;
    school: string;
    year: string;
    type?: string;
    address?: string;
    month?: string;
    note?: string;
};

export type BibTexMisc = {
    entry: 'misc';
    author?: string;
    title?: string;
    howpublished?: string;
    month?: string;
    year?: string;
    note?: string;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export type BibTexPHDThesis = {
    entry: 'phdthesis';
    author: string;
    title: string;
    year: string;
    school: string;
    address?: string;
    month?: string;
    keywords?: string[];
    note?: string;
};

export type BibTexProceedings = {
    entry: 'proceedings';
    title: string;
    year: string;
    editor?: string;
    volume?: string;
    number?: string;
    series?: string;
    address?: string;
    month?: string;
    organization?: string;
    publisher?: string;
    note?: string;
};

export type BibTexTechReport = {
    entry: 'techreport';
    author: string;
    title: string;
    institution: string;
    year: string;
    type?: string;
    number?: string;
    address?: string;
    month?: string;
    note?: string;
};

export type BibTexUnpublished = {
    entry: 'unpublished';
    author: string;
    title: string;
    note: string;
    month?: string;
    year?: string;
};

export type BibTexMetadata =
    | BibTexArticle
    | BibTexBook
    | BibTexBooklet
    | BibTexConference
    | BibTexInBook
    | BibTexInCollection
    | BibTexManual
    | BibTexMastersThesis
    | BibTexMisc
    | BibTexPHDThesis
    | BibTexProceedings
    | BibTexTechReport
    | BibTexUnpublished;

type CustomMetadata = {
    custom?: {
        [key: string]: string;
    };
};

export type RefMetadata = BibTexMetadata & CustomMetadata;
