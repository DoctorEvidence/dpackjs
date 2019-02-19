const { assert } = require('chai')
const { serialize, parse, parseLazy, createParseStream, createSerializeStream, asBlock, Options, getLazyHeader } = require('..')
const fs = require('fs')
var inspector = require('inspector')
//inspector.open(9329, null, true)
var sampleData = JSON.parse(fs.readFileSync(__dirname + '/samples/study.json'))

suite('dpack node tests', () => {
	test('serialize/parse blocks', () => {
		const data = {
			nonBlock: 'just a string',
			block1: asBlock({ a: 1, name: 'one', type: 'odd', isOdd: true }),
			block2: asBlock({ a: 2, name: 'two', type: 'even'}),
			blockOfArray: asBlock([{ a: 2.5, name: 'two point five', type: 'decimal'}]),
			arrayOfBlocks : [
				asBlock({ a: 3, name: 'three', type: 'odd', isOdd: true }),
				asBlock({ a: 4, name: 'four', type: 'even'}),
				{ a: 4.5, name: 'not a block'},
				asBlock({ a: 5, name: 'five', type: 'odd', isOdd: true })
			]
		}
		const serialized = serialize(data)
		const parsed = parse(serialized)
		//data.blockOfArray = [{ a: 2.5, name: 'two point five', type: 'decimal'}] // expect a true array
		assert.deepEqual(parsed, data)
	})
	test('serialize/parse block of array', () => {
		const data = [
			'just a string',
			asBlock({ a: 1, name: 'one', type: 'odd', isOdd: true }),
			asBlock({ a: 2, name: 'two', type: 'even'})
		]
		const serialized = serialize(data)
		const parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})
	test('serialize/parse blocks lazily', () => {
		const data = asBlock({
			nonBlock: 'just a string',
			block1: asBlock({ a: 1, name: 'one', type: 'odd', isOdd: true }),
			block2: asBlock({ a: 2, name: 'two', type: 'even'}),
			blockOfArray: asBlock([{ a: 2.5, name: 'two point five', type: 'decimal'}]),
			arrayOfBlocks : [
				asBlock({ a: 3, name: 'three', type: 'odd', isOdd: true }),
				asBlock({ a: 4, name: 'four', type: 'even'}),
				asBlock({ a: 5, name: 'five', type: 'odd', isOdd: true })
			]
		})
		const serialized = serialize(data, { lazy: true })
		const parsed = parseLazy(serialized)
		assert.deepEqual(parsed, data)
	})

	test('serialize/parse stream with promise', () => {
		const serializeStream = createSerializeStream({
		})
		const parseStream = createParseStream()
		serializeStream.pipe(parseStream)
		const received = []
		parseStream.on('data', data => {
			received.push(data)
		})
		const messages = [{
			promised: Promise.resolve({
				name: 'eventually available'
			}),
			normal: 'value'
		}, {
			inArray: [
				Promise.resolve({
					name: 'array promise'
				})
			]
		}]
		for (const message of messages)
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				assert.deepEqual([{
					promised: {
						name: 'eventually available'
					},
					normal: 'value'
				}, {
					inArray: [{
						name: 'array promise'
					}]
				}], received)
				resolve()
			}, 10)
		})
	})
	test('serialize/parse stream', () => {
		const serializeStream = createSerializeStream({
		})
		const parseStream = createParseStream()
		serializeStream.pipe(parseStream)
		const received = []
		parseStream.on('data', data => {
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
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				assert.deepEqual(received, messages)
				resolve()
			}, 10)
		})
	})
	test('serialize/parse stream, multiple chunks', () => {
		const serializeStream = createSerializeStream({
		})
		const parseStream = createParseStream()
		let queue = Buffer.from([])
		serializeStream.on('data', data => {
			queue = Buffer.concat([queue, data])
		})
		let offset = 0
		const received = []
		parseStream.on('data', data => {
			received.push(data)
		})
		const messages = [{
			name: 'first'
		}, {
			name: 'second'
		}, {
			name: 'third',
			aBlock: asBlock({ name: 'in block' })
		}, {
			name: 'fourth',
			extra: [1, 3, { foo: 'hi'}, 'bye']
		}, {
			name: 'fifth',
			blocks: [
				asBlock({ name: 'block 1' }),
				{ name: 'not a block' },
				asBlock({ name: 'block 2' })
			]
		}]
		for (const message of messages)
			serializeStream.write(message)
		return new Promise((resolve, reject) => {
			function sendNext() {
				parseStream.write(queue.slice(offset, offset += 3))
				if (offset < queue.length) {
					setTimeout(sendNext)
				} else {
					assert.deepEqual(received, messages)
					resolve()
				}
			}
			setTimeout(sendNext)
		})
	})
})
