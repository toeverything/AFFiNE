# AFFiNE Code Guideline

| Item                                            | Specification                                       | Example                                                                               |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [Packages/Paths]()                              | aaa-bbb-ccc                                         | ligo-virgo, editor-todo                                                               |
| [.tsx]()                                        | PascalCase                                          | AddPage.tsx                                                                           |
| [.ts]()                                         | kebab-case                                          | file-export.ts                                                                        |
| [.json]()                                       | kebab-case                                          | file-export.ts                                                                        |
| [Domain File]()                                 | OpenRules                                           | xx._d.ts_ &#124; _tsconfig.xx_.json &#124; xx.spec .ts &#124; .env.xx &#124; yy-ds.ts |
| [Types]()                                       | UpperCamelCase                                      | WebEvent                                                                              |
| [Enum variants]()                               | UpperCamelCase                                      | Status{ Todo,Completed }                                                              |
| [Functions]()                                   | lowerCamelCase                                      |                                                                                       |
| [React Funciton Compoment]()                    | UpperCamelCase                                      | function DocShare(){}                                                                 |
| [React HOC]()                                   | UpperCamelCase                                      | function BussinessText(){}                                                            |
| [Function Parameter]()                          | lowerCamelCase                                      | function searchByIdOrName(idOrname){ }                                                |
| [Methods for external access]()                 | lowerCamelCase                                      | public sayHello(){ };                                                                 |
| [Externally Accessible Variables (Variables)]() | lowerCamelCase                                      | animal.sleepCount                                                                     |
| [General constructors]()                        | constructor or with_more_details                    |                                                                                       |
| [Local variables]()                             | lowerCamelCase                                      | const tableCollection = [];                                                           |
| [Statics]()                                     | SCREAMING_SNAKE_CASE                                | GLOBAL_MESSAGES                                                                       |
| [Constants](b)                                  | SCREAMING_SNAKE_CASE                                | GLOBAL_CONFIG                                                                         |
| [Type parameters]()                             | UpperCamelCase , usually a single capital letter: T | let a: Animal = new Animal()                                                          |
