#  ------------ manticoresearch: ms ------------

## Create a index table with a mapping

# https://manual.manticoresearch.com/Creating_a_table/Local_tables/Real-time_table

curl -v -X DELETE "http://localhost:9308/doc" | json
curl -v -X POST http://127.0.0.1:9308/cli -H "content-type: application/plain" -H "accept: application/json" --data-binary @./packages/backend/server/src/plugins/indexer/tables/doc.sql
curl -v -X POST http://127.0.0.1:9308/cli --data-binary @./packages/backend/server/src/plugins/indexer/tables/doc.sql
curl -v -X POST "http://localhost:9308/cli" -d "DESC doc"

+--------------------+-----------+----------------+
| Field              | Type      | Properties     |
+--------------------+-----------+----------------+
| id                 | bigint    |                |
| workspace_id       | text      | indexed stored |
| doc_id             | text      | indexed stored |
| title              | text      | indexed stored |
| summary            | text      | stored         |
| journal            | text      | indexed stored |
| created_by_user_id | text      | indexed stored |
| updated_by_user_id | text      | indexed stored |
| created_at         | timestamp |                |
| updated_at         | timestamp |                |
+--------------------+-----------+----------------+

curl -v -X DELETE "http://localhost:9308/block" | json
curl -v -X POST http://127.0.0.1:9308/cli -H "content-type: application/plain" --data-binary @./packages/backend/server/src/plugins/indexer/tables/block.sql
curl -v -X POST "http://localhost:9308/cli" -d "DESC block"

# curl -v -X PUT http://127.0.0.1:9308/block -H "content-type: application/json" --data-binary @./packages/backend/server/src/plugins/search/tables/block.json | json
# curl -v -X GET "http://localhost:9308/block/_mappings" | json

+--------------------+-----------+----------------+
| Field              | Type      | Properties     |
+--------------------+-----------+----------------+
| id                 | bigint    |                |
| workspace_id       | text      | indexed stored |
| doc_id             | text      | indexed stored |
| block_id           | text      | indexed stored |
| content            | text      | indexed stored |
| flavour            | text      | indexed stored |
| blob               | text      | stored         |
| ref_doc_id         | text      | indexed stored |
| parent_flavour     | text      | indexed stored |
| parent_block_id    | text      | indexed stored |
| additional         | text      | stored         |
| markdown_preview   | text      | stored         |
| created_by_user_id | text      | indexed stored |
| updated_by_user_id | text      | indexed stored |
| ref                | json      |                |
| created_at         | timestamp |                |
| updated_at         | timestamp |                |
+--------------------+-----------+----------------+


# error: HTTP/1.1 400 Bad Request
# {
#   "error": {
#     "type": "resource_already_exists_exception",
#     "reason": "index [testdocs] already exists",
#     "table": "testdocs"
#   },
#   "status": 400
# }

## Create or update a document in an index

curl -v -X POST "localhost:9308/_bulk" -H 'Content-Type: application/json' --data-binary @./packages/backend/server/src/data/es/mappings/test-docs.json | json
curl -v -X POST "localhost:9308/_bulk" -H 'Content-Type: application/json' --data-binary @./packages/backend/server/src/data/es/mappings/test-blocks.json | json

curl -sX POST http://localhost:9308/search -d '{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "query":{
    "match":{"*":"title8"}
  }
}
' | json

curl -sX POST http://localhost:9308/search -d '{
  "table":"blocks",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "query":{
    "match":{"*":"https://linear.app/affine-design/issue/AF-1379"}
  }
}' | json

curl -sX POST http://localhost:9308/search -d '{
  "table":"blocks",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "query":{
    "match":{"*":"*"}
  }
}' | json


## Query DSL

# https://manual.manticoresearch.com/Searching/Filters#must

curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "limit": 50,
  "offset": 0,
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "search"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId1"
        }
      }
    }
  }
}' | json

curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "limit": 50,
  "offset": 0,
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "你好"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId1"
        }
      }
    }
  }
}' | json

curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "limit": 50,
  "offset": 0,
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "这是一段标题中文😄"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId1"
        }
      }
    }
  }
}' | json

curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "limit": 50,
  "offset": 0,
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "a中文😄a"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId1"
        }
      }
    }
  }
}' | json


curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "limit": 50,
  "offset": 0,
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "不存在"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId1"
        }
      }
    }
  }
}' | json


curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "limit": 5,
  "offset": 4,
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "hello"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId1"
        }
      }
    }
  }
}' | json


curl -v -X POST "localhost:9308/search" -H 'Content-Type: application/json' -d '
{
  "table":"docs",
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "hello"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId2"
        }
      }
    }
  }
}' | json

# filter by updated_at >= 2025-04-01
curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "hello"
          }
        }
      ],
      "filter": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "range": {
            "updated_at": {
              "gte": 1744265053
            }
          }
        }
      ]
    }
  }
}' | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "hello"
          }
        }
      ],
      "should": [
        {
          "term": {
            "doc_id": {
              "value": "docId1",
              "boost": 1
            }
          }
        }
      ],
      "filter": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        }
      ]
    }
  }
}' | json


# workspace_id not match
curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "before_match": "<em>",
    "after_match": "</em>"
  },
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "title": "hello"
          }
        }
      ],
      "filter": {
        "term": {
          "workspace_id": "workspaceId3"
        }
      }
    }
  }
}' | json

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<em>"],
    "post_tags" : ["</em>"]
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "content": "hello"
          }
        }
      ],
      "should": [
        {
          "term": {
            "flavour": {
              "value": "title",
              "boost": 1
            }
          }
        }
      ],
      "filter": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        }
      ]
    }
  }
}' | json

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<em>"],
    "post_tags" : ["</em>"]
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "content": "中文"
          }
        }
      ],
      "should": [
        {
          "term": {
            "flavour": {
              "value": "title",
              "boost": 1
            }
          }
        }
      ],
      "filter": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        }
      ]
    }
  }
}' | json


# search refs from docIds
{
  type: 'boolean',
  occur: 'must',
  queries: [
    {
      type: 'boolean',
      occur: 'should',
      queries: docIds.map(id => ({
        type: 'match',
        field: 'docId',
        match: id,
      })),
    },
    {
      type: 'exists',
      field: 'refDocId',
    },
  ],
}

"exists": {
        "field": "refDocId"
      },

# https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-exists-query.html
# https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html#bool-min-should-match
curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<em>"],
    "post_tags" : ["</em>"]
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "fields": ["ref_doc_id", "ref"],
  "query": {
    "bool": {
      "must": [
        {
          "bool": {
            "should": [
              {
                "match": {
                  "doc_id": "docId2"
                }
              },
              {
                "match": {
                  "doc_id": "docId9"
                }
              }
            ]
          }
        },
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "exists": {
            "field": "ref_doc_id"
          }
        }
      ]
    }
  }
}' | json

# all docs
this.indexer.search(
  'doc',
  {
    type: 'all',
  },
  {
    pagination: {
      limit: Infinity,
    },
    fields: ['docId', 'title'],
  }
)

# https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results
curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 0,
  "size": 2,
  "query": {
    "match_all": {}
  }
}' | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 2,
  "size": 2,
  "query": {
    "match_all": {}
  }
}' | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 0,
  "size": 1000,
  "query": {
    "match_all": {}
  }
}' | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "search_after2": [1744178653,1741413853,7466857633813712683],
  "query": {
    "match_all": {}
  }
}' | json

# https://github.com/manticoresoftware/manticoresearch/issues/2811 scroll only
# https://manual.manticoresearch.com/Searching/Pagination?client=Elasticsearch

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "options": {
    "scroll": true
  }, 
  "size": 2,
  "query": {
    "match_all": {}
  }
}' | json

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "id": "desc" } ],
  "_source":["flavour","doc_id","ref_doc_id","content","created_at","updated_at"],
  "options": {
    "scroll": true
  }, 
  "size": 2,
  "query": {
    "match_all": {}
  }
}' | json


curl -X POST http://localhost:9308/block/_search -H 'Content-Type: application/json' -d '
{
  "sort":["_score",{"updated_at":"desc"}, { "id": "desc" }],
  "_source":["flavour","doc_id","ref_doc_id","content","created_at","updated_at"],
  "size": 2, 
  "options":{"scroll":true},
  "query":{"match_all":{}}
}
'  | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "options": {
    "scroll": "eyJvcmRlcl9ieV9zdHIiOiJ1cGRhdGVkX2F0IGRlc2MsIGlkIGRlc2MiLCJvcmRlcl9ieSI6W3siYXR0ciI6InVwZGF0ZWRfYXQiLCJkZXNjIjp0cnVlLCJ2YWx1ZSI6MTc0NDE3ODY1MywidHlwZSI6ImludCJ9LHsiYXR0ciI6ImlkIiwiZGVzYyI6dHJ1ZSwidmFsdWUiOjc0NjY4NTc2MzM4MTM3MTI2ODMsInR5cGUiOiJpbnQifV19"
  }, 
  "size": 2,
  "query": {
    "match_all": {}
  }
}' | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "options": {
    "scroll": "eyJvcmRlcl9ieV9zdHIiOiJ1cGRhdGVkX2F0IGRlc2MsIGlkIGRlc2MiLCJvcmRlcl9ieSI6W3siYXR0ciI6InVwZGF0ZWRfYXQiLCJkZXNjIjp0cnVlLCJ2YWx1ZSI6MTc0NDA5MjI1MywidHlwZSI6ImludCJ9LHsiYXR0ciI6ImlkIiwiZGVzYyI6dHJ1ZSwidmFsdWUiOjM3MzkwMzIzNzIxNTU3Mjg1NTUsInR5cGUiOiJpbnQifV19"
  }, 
  "size": 10,
  "query": {
    "match_all": {}
  }
}' | json

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "id": "desc" } ],
  "fields": ["doc_id", "title"],
  "options": {
    "scroll": "eyJvcmRlcl9ieV9zdHIiOiJ1cGRhdGVkX2F0IGRlc2MsIGlkIGRlc2MiLCJvcmRlcl9ieSI6W3siYXR0ciI6InVwZGF0ZWRfYXQiLCJkZXNjIjp0cnVlLCJ2YWx1ZSI6MTcxMjU1NjI1MywidHlwZSI6ImludCJ9LHsiYXR0ciI6ImlkIiwiZGVzYyI6dHJ1ZSwidmFsdWUiOjM2ODExMzY5MTU3NzMzNDQzNzcsInR5cGUiOiJpbnQifV19"
  }, 
  "size": 10,
  "query": {
    "match_all": {}
  }
}' | json


this.indexer
  .aggregate$(
    'block',
    {
      type: 'boolean',
      occur: 'must',
      queries: [
        {
          type: 'match',
          field: 'content',
          match: query,
        },
        {
          type: 'boolean',
          occur: 'should',
          queries: [
            {
              type: 'all',
            },
            {
              type: 'boost',
              boost: 1.5,
              query: {
                type: 'match',
                field: 'flavour',
                match: 'affine:page',
              },
            },
          ],
        },
      ],
    },
    'docId',
    {
      pagination: {
        limit: 50,
        skip: 0,
      },
      hits: {
        pagination: {
          limit: 2,
          skip: 0,
        },
        fields: ['blockId', 'flavour'],
        highlights: [
          {
            field: 'content',
            before: '<b>',
            end: '</b>',
          },
        ],
      },
    }
  )

this.indexer
  .aggregate$(
    'block',
    {
      type: 'boolean',
      occur: 'must',
      queries: [
        {
          type: 'match',
          field: 'content',
          match: query,
        },
        {
          type: 'boolean',
          occur: 'should',
          queries: [
            {
              type: 'match',
              field: 'content',
              match: query,
            },
            {
              type: 'boost',
              boost: 1.5,
              query: {
                type: 'match',
                field: 'flavour',
                match: 'affine:page',
              },
            },
          ],
        },
      ],
    },
    'docId',
    {
      pagination: {
        limit: 50,
        skip: 0,
      },
      hits: {
        pagination: {
          limit: 2,
          skip: 0,
        },
        fields: ['blockId', 'flavour'],
        highlights: [
          {
            field: 'content',
            before: '<b>',
            end: '</b>',
          },
        ],
      },
    }
  )


# https://www.elastic.co/docs/explore-analyze/query-filter/aggregations
# https://www.elastic.co/docs/reference/aggregations/
curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "_source": false,
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "match": {
            "content": "hello"
          }
        },
        {
          "bool": {
            "should": [
              {
                "match_all": {}
              },
              {
                "match": {
                  "flavour": {
                    "query": "affine:page",
                    "boost": 1.5
                  }
                }
              }
            ]
          }
        }
      ]
    }
  },
  "aggs": {
    "result": {
      "terms": { "field": "doc_id" },
      "aggs": {
        "result": {
          "top_hits": {
            "_source": false,
            "highlight": {
              "pre_tags" : ["<b>"],
              "post_tags" : ["</b>"],
              "fields": {
                "content": {}
              }
            },
            "fields": ["block_id", "flavour"],
            "sort": [ "_score", { "updated_at": "desc" }, { "created_at": "desc" } ],
            "size": 2
          }
        }
      }
    }
  }
}' | json

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "_source": false,
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "match": {
            "content": "hello"
          }
        },
        {
          "bool": {
            "should": [
              {
                "match_all": {}
              },
              {
                "match": {
                  "flavour": {
                    "query": "affine:page",
                    "boost": 1.5
                  }
                }
              }
            ]
          }
        }
      ]
    }
  },
  "aggs": {
    "result": {
      "terms": { "field": "doc_id" }
    }
  }
}' | json

# workspace_id=workspaceId1 AND content^=hello AND (all OR flavour=affine:page)
curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<b>"],
    "post_tags" : ["</b>"]
  },
  "sort": [ "_score", { "updated_at": "desc" }, "doc_id", "block_id" ],
  "fields": ["block_id", "flavour"],
  "_source": ["block_id", "flavour"],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "workspace_id": {
              "query": "workspaceId1"
            }
          }
        },
        {
          "match": {
            "content": {
              "query": "hello"
            }
          }
        },
        {
          "bool": {
            "should": [
              {
                "match": {
                  "content": {
                    "query": "hello"
                  }
                }
              },
              {
                "match": {
                  "flavour": {
                    "query": "affine:page",
                    "boost": 1.5
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
}' | json

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<b>"],
    "post_tags" : ["</b>"]
  },
  "sort": [ "_score", { "updated_at": "desc" }, "doc_id", "block_id" ],
  "fields": ["block_id", "flavour"],
  "_source": ["block_id", "flavour"],
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "bool": {
            "must": [
              {
                "match": {
                  "content": "hello"
                }
              },
              {
                "bool": {
                  "should": [
                    {
                      "match": {
                        "content": "hello"
                      }
                    },
                    {
                      "match": {
                        "flavour": {
                          "query": "affine:page",
                          "boost": 1.5
                        }
                      }
                    }
                  ]
                }
              }
            ]
          }
        }
      ] 
    }
  }
}' | json


this.indexer
  .aggregate$(
    'block',
    {
      type: 'boolean',
      occur: 'must',
      queries: [
        {
          type: 'match',
          field: 'refDocId',
          match: docId,
        },
        // Ignore if it is a link to the current document.
        {
          type: 'boolean',
          occur: 'must_not',
          queries: [
            {
              type: 'match',
              field: 'docId',
              match: docId,
            },
          ],
        },
      ],
    },
    'docId',
    {
      hits: {
        fields: [
          'docId',
          'blockId',
          'parentBlockId',
          'parentFlavour',
          'additional',
          'markdownPreview',
        ],
        pagination: {
          limit: 5, // the max number of backlinks to show for each doc
        },
      },
      pagination: {
        limit: 100,
      },
    }
  )

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "_source": ["doc_id", "block_id", "parent_block_id", "parent_flavour", "additional", "markdown_preview"],
  "fields": ["doc_id", "block_id", "parent_block_id", "parent_flavour", "additional", "markdown_preview"],
  "size": 100,
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "match": {
            "ref_doc_id": "docId2"
          }
        },
        {
          "bool": {
            "must_not": [
              {
                "match": {
                  "doc_id": "docId2"
                }
              }
            ]
          }
        }
      ]
    }
  }
}' | json



this.indexer
  .search$(
    'block',
    {
      type: 'boolean',
      occur: 'must',
      queries: [
        {
          type: 'match',
          field: 'refDocId',
          match: docId,
        },
        {
          type: 'match',
          field: 'parentFlavour',
          match: 'affine:database',
        },
        // Ignore if it is a link to the current document.
        {
          type: 'boolean',
          occur: 'must_not',
          queries: [
            {
              type: 'match',
              field: 'docId',
              match: docId,
            },
          ],
        },
      ],
    },
    {
      fields: ['docId', 'blockId', 'parentBlockId', 'additional'],
      pagination: {
        limit: 100,
      },
    }
  )

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "size": 100,
  "_source": ["doc_id", "block_id", "parent_block_id", "additional"],
  "fields": ["doc_id", "block_id", "parent_block_id", "additional"],
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "match": {
            "ref_doc_id": "docId2"
          }
        },
        {
          "match": {
            "parent_flavour": "affine:database"
          }
        },
        {
          "bool": {
            "must_not": [
              {
                "match": {
                  "doc_id": "docId2"
                }
              }
            ]
          }
        }
      ]
    }
  }
}' | json


this.indexer
  .search$(
    'doc',
    {
      type: 'match',
      field: 'docId',
      match: docId,
    },
    {
      fields: ['summary'],
      pagination: {
        limit: 1,
      },
    }
  )

curl -v -X POST "localhost:9308/doc/_search" -H 'Content-Type: application/json' -d '
{
  "_source": ["summary"],
  "fields": ["summary"],
  "size": 1,
  "query": {
    "bool": {
      "must": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "match": {
            "doc_id": "docId2"
          }
        }
      ]
    }
  }
}' | json


this.indexer.deleteByQuery('block', {
    type: 'match',
    field: 'docId',
    match: docId,
  });
# https://manual.manticoresearch.com/Data_creation_and_modification/Deleting_documents?static=true
curl -v -X POST "localhost:9308/bulk" -H 'Content-Type: application/x-ndjson' -d '
{ "delete": { "table": "blocks", "query": { "bool": { "must": [ { "match": { "workspace_id": "workspaceId1" } },  { "match": { "doc_id": "docId2" } } ] } } }}
' | json

curl -v -X POST "localhost:9308/block/_search" -H 'Content-Type: application/json' -d '
{
  "query": {
    "match": {
      "doc_id": "docId2"
    }
  }
}' | json
