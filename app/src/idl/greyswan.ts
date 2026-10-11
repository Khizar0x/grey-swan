/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/greyswan.json`.
 */
export type Greyswan = {
  "address": "2YnarssLwdKPi3Br6C6cUcAuKyyoDagXaHZWo3kykcko",
  "metadata": {
    "name": "greyswan",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "adminOpenDispute",
      "discriminator": [
        29,
        253,
        255,
        130,
        240,
        15,
        170,
        183
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "appeal",
      "discriminator": [
        250,
        91,
        1,
        244,
        179,
        52,
        75,
        236
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "rental"
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "appellant",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimRefund",
      "discriminator": [
        15,
        16,
        30,
        161,
        255,
        228,
        97,
        60
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "completeAfterInspectionDeadline",
      "discriminator": [
        87,
        247,
        0,
        51,
        72,
        203,
        2,
        14
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true,
          "signer": true
        },
        {
          "name": "platformWallet",
          "writable": true,
          "address": "32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "confirmArrivalAfterDeadline",
      "discriminator": [
        164,
        202,
        114,
        249,
        39,
        202,
        73,
        91
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "confirmReturn",
      "discriminator": [
        4,
        2,
        116,
        9,
        172,
        37,
        212,
        19
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "renter",
          "writable": true
        },
        {
          "name": "platformWallet",
          "writable": true,
          "address": "32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "expireAppeal",
      "discriminator": [
        103,
        85,
        227,
        157,
        166,
        89,
        78,
        46
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true
        },
        {
          "name": "platformWallet",
          "writable": true,
          "address": "32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD"
        },
        {
          "name": "caller",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "finalizeVerdict",
      "discriminator": [
        97,
        17,
        118,
        183,
        198,
        231,
        123,
        77
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true
        },
        {
          "name": "platformWallet",
          "writable": true,
          "address": "32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD"
        },
        {
          "name": "caller",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "flagNotReturned",
      "discriminator": [
        99,
        199,
        174,
        64,
        204,
        70,
        25,
        211
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "flagReturnIssue",
      "discriminator": [
        154,
        215,
        254,
        141,
        243,
        134,
        108,
        230
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "flagReturnNotReceived",
      "discriminator": [
        201,
        106,
        151,
        77,
        235,
        205,
        121,
        133
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "increment",
      "discriminator": [
        11,
        18,
        104,
        9,
        104,
        174,
        59,
        33
      ],
      "accounts": [
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "admin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "initPool",
      "discriminator": [
        116,
        233,
        199,
        204,
        115,
        159,
        171,
        36
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "counter",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  117,
                  110,
                  116,
                  101,
                  114
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "listItem",
      "discriminator": [
        174,
        245,
        22,
        211,
        228,
        103,
        121,
        13
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  105,
                  115,
                  116,
                  105,
                  110,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "itemName"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "itemName",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "photos",
          "type": "string"
        },
        {
          "name": "rentalPrice",
          "type": "u64"
        },
        {
          "name": "depositAmount",
          "type": "u64"
        },
        {
          "name": "estimatedValue",
          "type": "u64"
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "category"
            }
          }
        },
        {
          "name": "rarityTier",
          "type": {
            "defined": {
              "name": "rarityTier"
            }
          }
        }
      ]
    },
    {
      "name": "migrateConfig",
      "discriminator": [
        92,
        131,
        58,
        105,
        210,
        154,
        224,
        193
      ],
      "accounts": [
        {
          "name": "config",
          "docs": [
            "checks owner, discriminator, length, bump and admin before writing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "postVerdict",
      "discriminator": [
        198,
        254,
        149,
        6,
        94,
        65,
        180,
        197
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "rental"
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "verdictSigner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "tiers",
          "type": "bytes"
        },
        {
          "name": "promptHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "outputHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "rejectOnArrival",
      "discriminator": [
        220,
        140,
        150,
        16,
        102,
        70,
        23,
        229
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "renter",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "photos",
          "type": "string"
        },
        {
          "name": "reason",
          "type": "string"
        }
      ]
    },
    {
      "name": "removeListing",
      "discriminator": [
        74,
        5,
        236,
        7,
        2,
        104,
        139,
        114
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "rentItem",
      "discriminator": [
        182,
        143,
        120,
        184,
        147,
        89,
        164,
        37
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true,
          "signer": true
        },
        {
          "name": "renter",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "weeks",
          "type": "u16"
        }
      ]
    },
    {
      "name": "resolveDispute",
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "secondReviewer",
          "signer": true,
          "optional": true
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "ownerAmount",
          "type": "u64"
        },
        {
          "name": "renterAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reviewerResolve",
      "discriminator": [
        174,
        78,
        148,
        214,
        196,
        24,
        151,
        251
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true
        },
        {
          "name": "platformWallet",
          "writable": true,
          "address": "32tt6bRdV1bM9D9ZkgfPFz3kt44YgpfJ6yYhfz8kiYbD"
        },
        {
          "name": "reviewer",
          "signer": true
        },
        {
          "name": "secondReviewer",
          "signer": true,
          "optional": true
        }
      ],
      "args": [
        {
          "name": "ownerBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "submitPhase1",
      "discriminator": [
        35,
        119,
        221,
        107,
        182,
        179,
        68,
        91
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "photos",
          "type": "string"
        },
        {
          "name": "trackingNumber",
          "type": "string"
        }
      ]
    },
    {
      "name": "submitPhase2",
      "discriminator": [
        153,
        165,
        17,
        158,
        90,
        98,
        32,
        54
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "renter",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "photos",
          "type": "string"
        }
      ]
    },
    {
      "name": "submitPhase3",
      "discriminator": [
        225,
        110,
        7,
        54,
        30,
        152,
        133,
        249
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "timeline",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  105,
                  109,
                  101,
                  108,
                  105,
                  110,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "renter",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "photos",
          "type": "string"
        },
        {
          "name": "trackingNumber",
          "type": "string"
        }
      ]
    },
    {
      "name": "submitPhase4",
      "discriminator": [
        221,
        150,
        197,
        47,
        185,
        203,
        204,
        139
      ],
      "accounts": [
        {
          "name": "rental",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "photos",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateConfig",
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "update",
          "type": {
            "defined": {
              "name": "configUpdate"
            }
          }
        }
      ]
    },
    {
      "name": "updateListing",
      "discriminator": [
        192,
        174,
        210,
        68,
        116,
        40,
        242,
        253
      ],
      "accounts": [
        {
          "name": "listing",
          "writable": true
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "photos",
          "type": "string"
        },
        {
          "name": "rentalPrice",
          "type": "u64"
        },
        {
          "name": "depositAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "voidVerdict",
      "discriminator": [
        37,
        141,
        60,
        35,
        143,
        53,
        1,
        18
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "rental"
        },
        {
          "name": "dispute",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  105,
                  115,
                  112,
                  117,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "rental"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "renter",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "withdrawPool",
      "discriminator": [
        190,
        43,
        148,
        248,
        68,
        5,
        215,
        136
      ],
      "accounts": [
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              }
            ]
          }
        },
        {
          "name": "recipient",
          "docs": [
            "lamports."
          ],
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "counter",
      "discriminator": [
        255,
        176,
        4,
        245,
        188,
        253,
        124,
        25
      ]
    },
    {
      "name": "dispute",
      "discriminator": [
        36,
        49,
        241,
        67,
        40,
        36,
        241,
        74
      ]
    },
    {
      "name": "listing",
      "discriminator": [
        218,
        32,
        50,
        73,
        43,
        134,
        26,
        58
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "rental",
      "discriminator": [
        121,
        83,
        229,
        235,
        73,
        50,
        143,
        184
      ]
    },
    {
      "name": "rentalTimeline",
      "discriminator": [
        240,
        3,
        10,
        31,
        211,
        5,
        100,
        37
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the counter authority can update this counter"
    },
    {
      "code": 6001,
      "name": "counterOverflow",
      "msg": "Counter has reached the maximum value"
    },
    {
      "code": 6002,
      "name": "invalidRentalPrice",
      "msg": "Rental price must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidDepositAmount",
      "msg": "Deposit amount must be greater than zero"
    },
    {
      "code": 6004,
      "name": "listingNotAvailable",
      "msg": "This listing is not currently available"
    },
    {
      "code": 6005,
      "name": "notListingOwner",
      "msg": "Only the listing owner can confirm this return"
    },
    {
      "code": 6006,
      "name": "invalidRentalStatus",
      "msg": "This rental is not in a state that can be confirmed"
    },
    {
      "code": 6007,
      "name": "notRenter",
      "msg": "Only the renter can claim this refund"
    },
    {
      "code": 6008,
      "name": "timeoutNotElapsed",
      "msg": "The refund waiting period has not yet elapsed"
    },
    {
      "code": 6009,
      "name": "itemNameTooLong",
      "msg": "Item name must be 50 characters or fewer"
    },
    {
      "code": 6010,
      "name": "descriptionTooLong",
      "msg": "Description must be 1200 characters or fewer"
    },
    {
      "code": 6011,
      "name": "photosLinkTooLong",
      "msg": "Photos link must be 200 characters or fewer"
    },
    {
      "code": 6012,
      "name": "invalidEstimatedValue",
      "msg": "Estimated value must be greater than zero for rare and antique items"
    },
    {
      "code": 6013,
      "name": "depositExceedsCap",
      "msg": "Deposit cannot exceed 45% of the item's estimated value"
    },
    {
      "code": 6014,
      "name": "invalidRentalDuration",
      "msg": "Rentals must be between 1 and 12 weeks"
    },
    {
      "code": 6015,
      "name": "mathOverflow",
      "msg": "Amount calculation overflowed"
    },
    {
      "code": 6016,
      "name": "phaseOutOfOrder",
      "msg": "The previous handover step must be completed first"
    },
    {
      "code": 6017,
      "name": "trackingNumberTooLong",
      "msg": "Tracking number must be 40 characters or fewer"
    },
    {
      "code": 6018,
      "name": "photosLinkRequired",
      "msg": "A photos link is required for this step"
    },
    {
      "code": 6019,
      "name": "trackingNumberRequired",
      "msg": "A tracking number is required for this step"
    },
    {
      "code": 6020,
      "name": "notRenterForPhase",
      "msg": "Only the renter can complete this step"
    },
    {
      "code": 6021,
      "name": "notOwnerForPhase",
      "msg": "Only the owner can complete this step"
    },
    {
      "code": 6022,
      "name": "handoverIncomplete",
      "msg": "All four handover steps must be completed before confirming"
    },
    {
      "code": 6023,
      "name": "notAdmin",
      "msg": "Only the admin wallet can resolve disputes"
    },
    {
      "code": 6024,
      "name": "notDisputed",
      "msg": "This rental is not under dispute"
    },
    {
      "code": 6025,
      "name": "disputeReasonRequired",
      "msg": "A reason is required when raising an issue"
    },
    {
      "code": 6026,
      "name": "disputeReasonTooLong",
      "msg": "Reason must be 300 characters or fewer"
    },
    {
      "code": 6027,
      "name": "resolutionAmountMismatch",
      "msg": "The resolution amounts must equal the total funds held"
    },
    {
      "code": 6028,
      "name": "ownerAlreadyShipped",
      "msg": "A refund is only available if the item was never sent"
    },
    {
      "code": 6029,
      "name": "listingMismatch",
      "msg": "This listing does not belong to this rental"
    },
    {
      "code": 6030,
      "name": "configAlreadyMigrated",
      "msg": "Settings have already been upgraded"
    },
    {
      "code": 6031,
      "name": "configNotMigrated",
      "msg": "Settings must be upgraded before this can be used"
    },
    {
      "code": 6032,
      "name": "invalidConfigAccount",
      "msg": "Settings account is not in the expected format"
    },
    {
      "code": 6033,
      "name": "bpsOutOfRange",
      "msg": "Basis point values cannot exceed 10000"
    },
    {
      "code": 6034,
      "name": "rubricNotAscending",
      "msg": "Damage tier percentages must be in ascending order"
    },
    {
      "code": 6035,
      "name": "invalidTier",
      "msg": "Tier must be between 0 and 4"
    },
    {
      "code": 6036,
      "name": "appealWindowTooShort",
      "msg": "The appeal window cannot be shorter than 24 hours"
    },
    {
      "code": 6037,
      "name": "invalidDuration",
      "msg": "Duration is outside the allowed range"
    },
    {
      "code": 6038,
      "name": "tooManyReviewers",
      "msg": "No more than 10 reviewers are allowed"
    },
    {
      "code": 6039,
      "name": "invalidReviewer",
      "msg": "Reviewer list contains an empty or repeated entry"
    },
    {
      "code": 6040,
      "name": "arrivalWindowClosed",
      "msg": "The window to confirm arrival has closed"
    },
    {
      "code": 6041,
      "name": "invalidTimelineAccount",
      "msg": "Rental timeline account is not in the expected format"
    },
    {
      "code": 6042,
      "name": "arrivalWindowStillOpen",
      "msg": "The renter still has time to confirm arrival"
    },
    {
      "code": 6043,
      "name": "returnWindowStillOpen",
      "msg": "The renter still has time to send the item back"
    },
    {
      "code": 6044,
      "name": "rentalTimesNotRecorded",
      "msg": "This rental has no recorded dates for this step"
    },
    {
      "code": 6045,
      "name": "inspectionWindowStillOpen",
      "msg": "The owner still has time to check the returned item"
    },
    {
      "code": 6046,
      "name": "inspectionWindowClosed",
      "msg": "The window to check the returned item has closed"
    },
    {
      "code": 6047,
      "name": "disputesPaused",
      "msg": "Damage decisions are paused"
    },
    {
      "code": 6048,
      "name": "notVerdictKey",
      "msg": "Only the damage review service can post this"
    },
    {
      "code": 6049,
      "name": "notReviewer",
      "msg": "Only a reviewer can decide this"
    },
    {
      "code": 6050,
      "name": "wrongDisputeKind",
      "msg": "This step doesn't apply to this kind of issue"
    },
    {
      "code": 6051,
      "name": "invalidDisputeStatus",
      "msg": "This issue is not at a stage where this can be done"
    },
    {
      "code": 6052,
      "name": "invalidTierCount",
      "msg": "A decision needs between 1 and 8 findings"
    },
    {
      "code": 6053,
      "name": "tierOutOfRange",
      "msg": "Each finding's tier must be between 0 and 4"
    },
    {
      "code": 6054,
      "name": "needsHumanReview",
      "msg": "This issue needs a human reviewer"
    },
    {
      "code": 6055,
      "name": "appealWindowClosed",
      "msg": "The window to appeal has closed"
    },
    {
      "code": 6056,
      "name": "alreadyAppealed",
      "msg": "You have already appealed this decision"
    },
    {
      "code": 6057,
      "name": "notRentalParty",
      "msg": "Only the owner or renter can appeal"
    },
    {
      "code": 6058,
      "name": "appealWindowStillOpen",
      "msg": "The window to appeal is still open"
    },
    {
      "code": 6059,
      "name": "appealNotExpired",
      "msg": "The appeal is still within its review period"
    },
    {
      "code": 6060,
      "name": "secondReviewerRequired",
      "msg": "This decision needs a second, different reviewer"
    },
    {
      "code": 6061,
      "name": "poolBalanceTooLow",
      "msg": "The user protection pool doesn't hold enough for this"
    },
    {
      "code": 6062,
      "name": "sameOwnerAndRenter",
      "msg": "The owner and renter are the same wallet"
    },
    {
      "code": 6063,
      "name": "appealCannotWin",
      "msg": "This verdict already gives you everything an appeal could"
    },
    {
      "code": 6064,
      "name": "invalidVerdictKey",
      "msg": "The verdict key must not be the admin or a reviewer"
    },
    {
      "code": 6065,
      "name": "configValueTooHigh",
      "msg": "This value is above its allowed maximum"
    }
  ],
  "types": [
    {
      "name": "category",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "photographyVideo"
          },
          {
            "name": "musicAudio"
          },
          {
            "name": "toolsEquipment"
          },
          {
            "name": "sportsOutdoor"
          },
          {
            "name": "other"
          },
          {
            "name": "electronics"
          },
          {
            "name": "homeGarden"
          },
          {
            "name": "eventsParty"
          },
          {
            "name": "fashionCostumes"
          },
          {
            "name": "babyKids"
          },
          {
            "name": "digitalCloud"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "verdictKey",
            "type": "pubkey"
          },
          {
            "name": "reviewerCount",
            "type": "u8"
          },
          {
            "name": "reviewers",
            "type": {
              "array": [
                "pubkey",
                10
              ]
            }
          },
          {
            "name": "rubricBps",
            "type": {
              "array": [
                "u16",
                5
              ]
            }
          },
          {
            "name": "extraFindingBps",
            "type": "u16"
          },
          {
            "name": "autoReleaseMaxTier",
            "type": "u8"
          },
          {
            "name": "appealWindowSecs",
            "type": "i64"
          },
          {
            "name": "appealExpirySecs",
            "type": "i64"
          },
          {
            "name": "phase2DeadlineSecs",
            "type": "i64"
          },
          {
            "name": "bondBps",
            "type": "u16"
          },
          {
            "name": "bondMinLamports",
            "type": "u64"
          },
          {
            "name": "largeDepositThresholdLamports",
            "type": "u64"
          },
          {
            "name": "twoReviewerThresholdLamports",
            "type": "u64"
          },
          {
            "name": "notReturnedGraceSecs",
            "type": "i64"
          },
          {
            "name": "inspectionDeadlineSecs",
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                112
              ]
            }
          }
        ]
      }
    },
    {
      "name": "configUpdate",
      "docs": [
        "Each field left as None keeps its current value."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "verdictKey",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "reviewers",
            "docs": [
              "Replaces the whole reviewer list."
            ],
            "type": {
              "option": {
                "vec": "pubkey"
              }
            }
          },
          {
            "name": "rubricBps",
            "type": {
              "option": {
                "array": [
                  "u16",
                  5
                ]
              }
            }
          },
          {
            "name": "extraFindingBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "autoReleaseMaxTier",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "appealWindowSecs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "appealExpirySecs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "phase2DeadlineSecs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bondBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "bondMinLamports",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "largeDepositThresholdLamports",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "twoReviewerThresholdLamports",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "notReturnedGraceSecs",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "inspectionDeadlineSecs",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    },
    {
      "name": "counter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "count",
            "type": "u64"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "dispute",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "disputeKind"
              }
            }
          },
          {
            "name": "openedAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "disputeStatus"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "tierCount",
            "type": "u8"
          },
          {
            "name": "tiers",
            "type": {
              "array": [
                "u8",
                8
              ]
            }
          },
          {
            "name": "verdictOwnerBps",
            "type": "u16"
          },
          {
            "name": "promptHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "outputHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "verdictPostedAt",
            "type": "i64"
          },
          {
            "name": "appealDeadline",
            "type": "i64"
          },
          {
            "name": "appealExpiresAt",
            "type": "i64"
          },
          {
            "name": "ownerAppealed",
            "type": "bool"
          },
          {
            "name": "renterAppealed",
            "type": "bool"
          },
          {
            "name": "ownerBond",
            "type": "u64"
          },
          {
            "name": "renterBond",
            "type": "u64"
          },
          {
            "name": "finalOwnerBps",
            "type": "u16"
          },
          {
            "name": "resolvedBy",
            "type": {
              "array": [
                "pubkey",
                2
              ]
            }
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                193
              ]
            }
          }
        ]
      }
    },
    {
      "name": "disputeKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "returnIssue"
          },
          {
            "name": "arrivalIssue"
          },
          {
            "name": "notReturned"
          },
          {
            "name": "adminOpened"
          },
          {
            "name": "returnNotReceived"
          }
        ]
      }
    },
    {
      "name": "disputeStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "verdictPosted"
          },
          {
            "name": "appealed"
          },
          {
            "name": "resolved"
          },
          {
            "name": "voided"
          }
        ]
      }
    },
    {
      "name": "handoverPhase",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "beforeSending"
          },
          {
            "name": "onArrival"
          },
          {
            "name": "beforeReturning"
          },
          {
            "name": "onReturn"
          }
        ]
      }
    },
    {
      "name": "listing",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "itemName",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "photos",
            "type": "string"
          },
          {
            "name": "rentalPrice",
            "type": "u64"
          },
          {
            "name": "depositAmount",
            "type": "u64"
          },
          {
            "name": "estimatedValue",
            "type": "u64"
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "rarityTier",
            "type": {
              "defined": {
                "name": "rarityTier"
              }
            }
          },
          {
            "name": "isAvailable",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "totalReceived",
            "type": "u64"
          },
          {
            "name": "totalWithdrawn",
            "type": "u64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "rarityTier",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "common"
          },
          {
            "name": "rare"
          },
          {
            "name": "antique"
          }
        ]
      }
    },
    {
      "name": "rental",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "listing",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "renter",
            "type": "pubkey"
          },
          {
            "name": "weeklyPrice",
            "type": "u64"
          },
          {
            "name": "weeks",
            "type": "u16"
          },
          {
            "name": "totalRentalCost",
            "type": "u64"
          },
          {
            "name": "depositAmount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "rentalStatus"
              }
            }
          },
          {
            "name": "currentPhase",
            "type": {
              "defined": {
                "name": "handoverPhase"
              }
            }
          },
          {
            "name": "phase1Photos",
            "type": "string"
          },
          {
            "name": "outboundTracking",
            "type": "string"
          },
          {
            "name": "phase2Photos",
            "type": "string"
          },
          {
            "name": "phase3Photos",
            "type": "string"
          },
          {
            "name": "returnTracking",
            "type": "string"
          },
          {
            "name": "phase4Photos",
            "type": "string"
          },
          {
            "name": "disputeKind",
            "type": {
              "defined": {
                "name": "disputeKind"
              }
            }
          },
          {
            "name": "disputeReason",
            "type": "string"
          },
          {
            "name": "disputedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "rentalStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "awaitingReturn"
          },
          {
            "name": "awaitingConfirmation"
          },
          {
            "name": "disputed"
          },
          {
            "name": "completed"
          },
          {
            "name": "refundedAuto"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "rentalTimeline",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "rental",
            "type": "pubkey"
          },
          {
            "name": "shippedAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "arrivalDeadline",
            "type": "i64"
          },
          {
            "name": "arrivedAt",
            "type": "i64"
          },
          {
            "name": "returnDueAt",
            "type": "i64"
          },
          {
            "name": "returnShippedAt",
            "type": "i64"
          },
          {
            "name": "inspectionDeadline",
            "type": "i64"
          },
          {
            "name": "notReturnedAfter",
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          }
        ]
      }
    }
  ]
};
