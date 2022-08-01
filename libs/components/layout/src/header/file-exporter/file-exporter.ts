import { PageBlock } from '../types';
import TurndownService from 'turndown';
const FileExporter = {
    exportFile: (filename: string, text: string, format: string) => {
        const element = document.createElement('a');
        element.setAttribute(
            'href',
            'data:' + format + ';charset=utf-8,' + encodeURIComponent(text)
        );
        element.setAttribute('download', filename);

        element.style.display = 'none';
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);
    },
    decorateHtml: (pageTitle: string, htmlContent: string) => {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>${pageTitle}</title>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css">
        </head>
        <body>
            <div style="margin:20px auto;width:800px" >
               <div style="background-color: #fff;box-shadow: 0px 0px 5px #ccc;padding: 10px;">
                 ${htmlContent}
               </div>
            </div>
        </body>
        </html>`;
    },
    decoreateAffineBrand: (pageTitle: string) => {
        return pageTitle + ` Created in AFFiNE`;
    },
    exportHtml: (pageTitle: string, htmlContent: string) => {
        FileExporter.exportFile(
            FileExporter.decoreateAffineBrand(pageTitle) + '.html',
            FileExporter.decorateHtml(pageTitle, htmlContent),
            'text/html'
        );
    },

    exportMarkdown: (pageTitle: string, htmlContent: string) => {
        const turndownService = new TurndownService();
        const markdown = turndownService.turndown(htmlContent);

        FileExporter.exportFile(
            FileExporter.decoreateAffineBrand(pageTitle) + '.md',
            markdown,
            'text/plain'
        );
    },
};

export { FileExporter };
