const { assert } = require('chai')

const { decode, encode, makeDocument } = require('../index')
const inspector =  require('inspector')
inspector.open(9329, null, true)

suite('encode', () => {

  test('encode', () => {
  	const data = { data: [{ a: 1 }, { a: 2 }]}
    const myDoc = makeDocument(data)
    const encoded = encode(myDoc)
    const decoded = decode(encoded)
    assert.deepEqual(decoded, data)
  })
})
