#  ------------ elasticsearch: es ------------
## Create a index table with a mapping

# https://www.elastic.co/docs/api/doc/elasticsearch/v8/operation/operation-indices-create

curl -v -X DELETE "localhost:9200/doc?pretty"
curl -v -X PUT http://127.0.0.1:9200/doc -H "content-type: application/json" --data-binary @./packages/backend/server/src/plugins/indexer/tables/doc.json
curl -v -X GET "http://localhost:9200/doc/_mappings?pretty"

{
  "doc" : {
    "mappings" : {
      "properties" : {
        "created_at" : {
          "type" : "date"
        },
        "created_by_user_id" : {
          "type" : "keyword"
        },
        "doc_id" : {
          "type" : "keyword"
        },
        "journal" : {
          "type" : "keyword"
        },
        "summary" : {
          "type" : "text",
          "index" : false
        },
        "title" : {
          "type" : "text"
        },
        "updated_at" : {
          "type" : "date"
        },
        "updated_by_user_id" : {
          "type" : "keyword"
        },
        "workspace_id" : {
          "type" : "keyword"
        }
      }
    }
  }
}

curl -v -X DELETE "localhost:9200/block?pretty"
curl -v -X PUT http://127.0.0.1:9200/block -H "content-type: application/json" --data-binary @./packages/backend/server/src/plugins/indexer/tables/block.json
curl -v -X GET "http://localhost:9200/block/_mappings?pretty"

{
  "block" : {
    "mappings" : {
      "properties" : {
        "additional" : {
          "type" : "text",
          "index" : false
        },
        "blob" : {
          "type" : "keyword"
        },
        "block_id" : {
          "type" : "keyword"
        },
        "content" : {
          "type" : "text"
        },
        "created_at" : {
          "type" : "date"
        },
        "created_by_user_id" : {
          "type" : "keyword"
        },
        "doc_id" : {
          "type" : "keyword"
        },
        "flavour" : {
          "type" : "keyword"
        },
        "markdown_preview" : {
          "type" : "text",
          "index" : false
        },
        "parent_block_id" : {
          "type" : "keyword"
        },
        "parent_flavour" : {
          "type" : "keyword"
        },
        "ref" : {
          "type" : "text",
          "index" : false
        },
        "ref_doc_id" : {
          "type" : "keyword"
        },
        "updated_at" : {
          "type" : "date"
        },
        "updated_by_user_id" : {
          "type" : "keyword"
        },
        "workspace_id" : {
          "type" : "keyword"
        }
      }
    }
  }
}

# error: HTTP/1.1 400 Bad Request
# {
#   "error": {
#     "root_cause": [
#       {
#         "type": "resource_already_exists_exception",
#         "reason": "index [testdocs/0nwHXxxmThGt4A9kMD91hA] already exists",
#         "index_uuid": "0nwHXxxmThGt4A9kMD91hA",
#         "index": "testdocs"
#       }
#     ],
#     "type": "resource_already_exists_exception",
#     "reason": "index [testdocs/0nwHXxxmThGt4A9kMD91hA] already exists",
#     "index_uuid": "0nwHXxxmThGt4A9kMD91hA",
#     "index": "testdocs"
#   },
#   "status": 400
# }


## Create or update a document in an index

# https://www.elastic.co/docs/api/doc/elasticsearch/v8/operation/operation-index

curl -v -X POST "localhost:9200/_bulk?pretty&refresh=true" -H 'Content-Type: application/json' --data-binary @./packages/backend/server/src/plugins/indexer/__tests__/test-docs.json
curl -v -X GET "localhost:9200/doc/_search?pretty"

curl -v -X POST "localhost:9200/_bulk?pretty&refresh=true" -H 'Content-Type: application/json' --data-binary @./packages/backend/server/src/plugins/indexer/__tests__/test-blocks.json
curl -v -X GET "localhost:9200/block/_search?pretty"

## Query DSL

# https://www.elastic.co/docs/api/doc/elasticsearch/v8/operation/operation-search-1
# https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html

# flavour title will be boosted
curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "content": {}
    }
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
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<em>"],
    "post_tags" : ["</em>"],
    "fields": {
      "content": {}
    }
  },
  "sort": [ "_score", { "updated_at": "desc" }, "doc_id", "block_id" ],
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
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "title": {}
    }
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
      "filter": [
        {
          "term": {
            "workspace_id": "workspaceId1"
          }
        },
        {
          "range": {
            "updated_at": {
              "gte": "2025-04-10T06:04:13.278Z"
            }
          }
        }
      ]
    }
  }
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "title": {}
    }
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
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
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "title": {}
    }
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
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
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "title": {}
    }
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
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "title": {}
    }
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
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "fields": {
      "content": {}
    },
    "pre_tags" : ["<em>"],
    "post_tags" : ["</em>"]
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "query": {
    "bool": {
      "must": [
        {
          "match": {
            "content": "https://linear.app/affine-design/issue/AF-1379"
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
}'


# https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-exists-query.html
curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "highlight": {
    "pre_tags" : ["<em>"],
    "post_tags" : ["</em>"]
  },
  "sort": [ "_score", { "updated_at": "desc" } ],
  "fields": ["ref_doc_id", "ref"],
  "query": {
    "bool": {
      "minimum_should_match": 1,
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
      ],
      "filter": [
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
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
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
        }
      ],
      "filter": [
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
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
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
}'

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
# you cannot use from and size to page through more than 10,000 hits
curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 0,
  "size": 2,
  "query": {
    "match_all": {}
  }
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 2,
  "size": 2,
  "query": {
    "match_all": {}
  }
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 1,
  "size": 2,
  "query": {
    "match_all": {}
  }
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" } ],
  "fields": ["doc_id", "title"],
  "from": 0,
  "size": 4,
  "query": {
    "match_all": {}
  }
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" } ],
  "fields": ["doc_id", "title"],
  "search_after": [1744178653278, 1741413853278],
  "query": {
    "match_all": {}
  }
}'

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "sort": [ { "updated_at": "desc" }, { "created_at": "desc" } ],
  "fields": ["doc_id", "title"],
  "search_after": [1712556253278, 1741413853278],
  "query": {
    "match_all": {}
  }
}'


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
# https://www.elastic.co/docs/explore-analyze/query-filter/aggregations
# https://www.elastic.co/docs/reference/aggregations/
curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
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
              "fields": {
                "content": {
                  "pre_tags" : ["<b>"],
                  "post_tags" : ["</b>"]
                }
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
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "_source": false,
  "sort": [ "_score", { "updated_at": "desc" }, { "created_at": "desc" } ],
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
  },
  "aggs": {
    "result": {
      "terms": { "field": "doc_id" },
      "aggs": {
        "result": {
          "top_hits": {
            "_source": false,
            "highlight": {
              "fields": {
                "content": {
                  "pre_tags": ["<b>"],
                  "post_tags": ["</b>"]
                }
              }
            },
            "fields": ["block_id", "flavour"],
            "size": 2
          }
        }
      }
    }
  }
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "_source": false,
  "sort": [ "_score", { "updated_at": "desc" }, { "created_at": "desc" } ],
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
  },
  "aggs": {
    "result": {
      "terms": { "field": "doc_id" },
      "aggs": {
        "result": {
          "top_hits": {
            "_source": false,
            "highlight": {
              "fields": {
                "content": {
                  "pre_tags": ["<b>"],
                  "post_tags": ["</b>"]
                }
              }
            },
            "fields": ["block_id", "flavour"],
            "size": 2
          }
        }
      }
    }
  }
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "_source": false,
  "highlight": {
    "pre_tags" : ["<b>"],
    "post_tags" : ["</b>"],
    "fields": {
      "content": {}
    }
  },
  "fields": ["block_id", "flavour"],
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
}'


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

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "_source": false,
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
  },
  "aggs": {
    "result": {
      "terms": { "field": "doc_id" },
      "aggs": {
        "result": {
          "top_hits": {
            "_source": false,
            "fields": ["doc_id", "block_id", "parent_block_id", "parent_flavour", "additional", "markdown_preview"],
            "size": 5
          }
        }
      }
    }
  }
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "_source": false,
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
            "fields": ["doc_id", "block_id", "parent_block_id", "parent_flavour", "additional", "markdown_preview"],
            "size": 5
          }
        }
      }
    }
  }
}'


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

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "size": 100,
  "_source": false,
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
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "size": 100,
  "_source": false,
  "fields": ["doc_id", "block_id", "parent_block_id", "additional"],
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
            "ref_doc_id": {
              "query": "docId2"
            }
          }
        },
        {
          "match": {
            "parent_flavour": {
              "query": "affine:database"
            }
          }
        },
        {
          "bool": {
            "must_not": [
              {
                "match": {
                  "doc_id": {
                    "query": "docId2"
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }
}'



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

curl -v -X POST "localhost:9200/doc/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "_source": false,
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
}'

this.indexer.deleteByQuery('block', {
    type: 'match',
    field: 'docId',
    match: docId,
  });

# https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete-by-query
curl -v -X POST "localhost:9200/block/_delete_by_query?pretty" -H 'Content-Type: application/json' -d '
{
  "query": {
    "match": {
      "doc_id": "docId2"
    }
  }
}'

curl -v -X POST "localhost:9200/block/_search?pretty" -H 'Content-Type: application/json' -d '
{
  "query": {
    "match": {
      "doc_id": "docId2"
    }
  }
}'
