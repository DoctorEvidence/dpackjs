const { assert } = require('chai')
const { deflateSync, inflateSync, constants } = require('zlib')
const { compressSync, uncompressSync } = require('snappy')
try {
  var { decode, encode } = require('msgpack-lite')
} catch (error) {}
const inspector = require('inspector')
const fs = require('fs')
inspector.open(9329, null, true)
const { serialize, parse, parseLazy, createParseStream, createSerializeStream, asBlock, Options } = require('..')
var sampleData = JSON.parse(fs.readFileSync(__dirname + '/samples/study.json'))
const ITERATIONS = 1000

suite('serialize', () => {
  test('serialize/parse data', () => {
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
        { prop: [undefined] },
  			{ prop: null }
  		]
  	}
    const serialized = serialize(data)
    const parsed = parse(serialized)
    assert.deepEqual(parsed, data)
  })

  test('serialize/parse sample data', () => {
    const data = sampleData
    const serialized = serialize(data)
    const parsed = parse(serialized)
    assert.deepEqual(parsed, data)
  })

  test('extended class', () => {
    function Extended() {

    }
    Extended.prototype.getDouble = function() {
      return this.value * 2
    }
    const instance = new Extended()
    instance.value = 4
    const data = {
      extendedInstance: instance
    }
    // TODO: create two of these
    const options = new Options()
    options.addExtension(Extended)
    const serialized = serialize(data, options)
    const parsed = parse(serialized, options)
    assert.equal(parsed.extendedInstance.getDouble(), 8)
  })

  test('extended class as root', () => {
    function Extended() {

    }
    Extended.prototype.getDouble = function() {
      return this.value * 2
    }
    const instance = new Extended()
    instance.value = 4
    const options = new Options()
    options.addExtension(Extended)
    const serialized = serialize(instance, options)
    const parsed = parse(serialized, options)
    assert.equal(parsed.getDouble(), 8)
  })

  test('set/map/date', () => {
    var map = new Map()
    map.set(4, 'four')
    map.set('three', 3)

    var set = new Set()
    set.add(1)
    set.add('2')
    set.add({ name: 3})

    const data = {
      map: map,
      set: set,
      date: new Date(1532219539819)
    }
    const serialized = serialize(data)
    const parsed = parse(serialized)
    assert.equal(parsed.map.get(4), 'four')
    assert.equal(parsed.map.get('three'), 3)
    assert.equal(parsed.date.getTime(), 1532219539819)
    assert.isTrue(parsed.set.has(1))
    assert.isTrue(parsed.set.has('2'))
    assert.isFalse(parsed.set.has(3))
  })

  test('set/map/date as root', () => {
    var map = new Map()
    map.set(4, 'four')
    map.set('three', 3)

    var set = new Set()
    set.add(1)
    set.add('2')
    set.add({ name: 3})

    let serialized = serialize(map)
    const parsedMap = parse(serialized)
    serialized = serialize(set)
    const parsedSet = parse(serialized)
    serialized = serialize(new Date(1532219539819))
    const parsedDate = parse(serialized)
    assert.equal(parsedMap.get(4), 'four')
    assert.equal(parsedMap.get('three'), 3)
    assert.equal(parsedDate.getTime(), 1532219539819)
    assert.isTrue(parsedSet.has(1))
    assert.isTrue(parsedSet.has('2'))
    assert.isFalse(parsedSet.has(3))
  })

  test('numbers', () => {
    const data = {
      bigEncodable: 48978578104322,
      dateEpoch: 1530886513200,
      realBig: 3432235352353255323,
      decimal: 32.55234,
      negative: -34.11,
      exponential: 0.234e123,
      tiny: 3.233e-120,
      zero: 0,
      //negativeZero: -0,
      Infinity: Infinity
    }
    const serialized = serialize(data)
    const parsed = parse(serialized)
    assert.deepEqual(parsed, data)
  })

  test('serialize/parse blocks', () => {
  	const data = {
      nonBlock: 'just a string',
  		block1: asBlock({ a: 1, name: 'one', type: 'odd', isOdd: true }),
  		block2: asBlock({ a: 2, name: 'two', type: 'even'}),
  		arrayOfBlocks : [
        asBlock({ a: 3, name: 'three', type: 'odd', isOdd: true }),
  			asBlock({ a: 4, name: 'four', type: 'even'}),
  			asBlock({ a: 5, name: 'five', type: 'odd', isOdd: true })
      ]
  	}
    const serialized = serialize(data)
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
  test.skip('big utf8', function() {
  	var data = sampleData
  	this.timeout(10000)
    const serialized = serialize(data, { utf8: true })
    const serializedGzip = deflateSync(serialized)
    console.log('size', serialized.length)
    console.log('deflate size', serializedGzip.length)
    let parsed
    for (var i = 0; i < ITERATIONS; i++) {
	    parsed = parse(serialized, { utf8: true })
	    //parsed = parse(inflateSync(serializedGzip))
	    parsed.Settings
    }
  })

  test.skip('performance msgpack-lite', function() {
    var data = sampleData
    this.timeout(10000)
    const serialized = encode(data)
    const serializedGzip = deflateSync(serialized)
    console.log('size', serialized.length)
    console.log('deflate size', serializedGzip.length)
    let parsed
    for (var i = 0; i < ITERATIONS; i++) {
      parsed = decode(serialized)
      //parsed = parse(inflateSync(serializedGzip))
      parsed.Settings
    }
  })

  test('performance JSON.parse', function() {
  	this.timeout(10000)
  	var data = sampleData
    const serialized = Buffer.from(JSON.stringify(data))
    const serializedGzip = deflateSync(serialized)
    console.log('size', serialized.length)
    console.log('deflate size', serializedGzip.length)
    let parsed
    for (var i = 0; i < ITERATIONS; i++) {
    	parsed = JSON.parse(serialized)
    	//parsed = JSON.parse(inflateSync(serializedGzip))
    	parsed.Settings
    }
  })
  test('performance', function() {
    var data = sampleData
    this.timeout(10000)
    const serialized = serialize(data)
    const serializedGzip = deflateSync(serialized)
    console.log('size', serialized.length)
    console.log('deflate size', serializedGzip.length)
    //console.log({ shortRefCount, longRefCount })
    let parsed
    for (var i = 0; i < ITERATIONS; i++) {
      parsed = parse(serialized)
      //parsed = parse(inflateSync(serializedGzip))
      parsed.Settings
    }
  })
  test('performance JSON.stringify', function() {
    var data = sampleData
    this.timeout(10000)
    for (var i = 0; i < ITERATIONS; i++) {
      const serialized = Buffer.from(JSON.stringify(data))
      //const serializedGzip = deflateSync(serialized)
    }
  })


  test('performance serialize', function() {
    debugger
    var data = sampleData
    this.timeout(10000)
    for (var i = 0; i < ITERATIONS; i++) {
      const serialized = serialize(data)
      //const serializedGzip = deflateSync(serialized)
    }
  })
  test.skip('performance encode msgpack-lite', function() {
    var data = sampleData
    this.timeout(10000)
    for (var i = 0; i < ITERATIONS; i++) {
      const serialized = encode(data)
      const serializedGzip = deflateSync(serialized)
    }
  })
})
