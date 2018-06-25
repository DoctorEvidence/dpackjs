const { assert } = require('chai')

const { decode, encode, makeDocument, createEncodeStream, createDecodeStream } = require('../index')
const inspector =  require('inspector')
inspector.open(9329, null, true)

suite('encode', () => {

  test('encode/decode document', () => {
  	const data = {
  		data: [
  			{ a: 1, name: 'one', type: 'odd', isOdd: true },
  			{ a: 2, name: 'two', type: 'even'},
  			{ a: 3, name: 'three', type: 'odd', isOdd: true },
  			{ a: 4, name: 'four', type: 'even'},
  			{ a: 5, name: 'five', type: 'odd', isOdd: true },
  			{ a: 6, name: 'six', type: 'even', isOdd: null }
		],
		description: 'some names',
		types: ['odd', 'even'],
		convertEnumToNum: [
			{ prop: 'test' },
			{ prop: 'test' },
			{ prop: 'test' },
			{ prop: 1 },
			{ prop: 2 },
			{ prop: null }
		]
	}
    const myDoc = makeDocument(data)
    const encoded = encode(myDoc)
    const decoded = decode(encoded)
    assert.deepEqual(decoded, data)
  })

  test('encode/decode no document', () => {
  	const data = {
  		data: [
  			{ a: 1, name: 'one', type: 'odd', isOdd: true },
  			{ a: 2, name: 'two', type: 'even'},
  			{ a: 3, name: 'three', type: 'odd', isOdd: true },
  			{ a: 4, name: 'four', type: 'even'},
  			{ a: 5, name: 'five', type: 'odd', isOdd: true },
  			{ a: 6, name: 'six', type: 'even', isOdd: null }
		],
		description: 'some names',
		types: ['odd', 'even'],
		convertEnumToNum: [
			{ prop: 'test' },
			{ prop: 'test' },
			{ prop: 'test' },
			{ prop: 1 },
			{ prop: 2 },
			{ prop: null }
		]
	}
    const encoded = encode(data)
    const decoded = decode(encoded)
    assert.deepEqual(decoded, data)
  })

  test('encode/decode stream', () => {
  	const encodeStream = createEncodeStream({
  		asDocument: true,
  	})
  	const decodeStream = createDecodeStream()
  	encodeStream.pipe(decodeStream)
  	const received = []
  	decodeStream.on('data', data => {
  		received.push(data)
  	})
  	const messages = [{
  		name: 'first'
  	}, {
  		name: 'second'
  	}, {
  		name: 'third'
  	}, {
  		name: 'third',
  		extra: [1, 3, { foo: 'hi'}, 'bye']
  	}]
  	for (const message of messages)
  		encodeStream.write(message)
  	setTimeout(() => {
  		assert.deepEqual(received, messages)
  	}, 10)
  })
})
