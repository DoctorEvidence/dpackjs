function tryRequire(module) {
	try {
		return require(module)
	} catch(error) {
		return {}
	}
}
if (typeof chai === 'undefined') { chai = require('chai') }
assert = chai.assert
if (typeof dpack === 'undefined') { dpack = require('..') }
var zlib = tryRequire('zlib')
var deflateSync = zlib.deflateSync
var inflateSync = zlib.inflateSync
var constants = zlib.constants
var snappy = tryRequire('snappy')
var compressSync = snappy.compressSync
var uncompressSync = snappy.uncompressSync
try {
	var { decode, encode } = require('msgpack-lite')
} catch (error) {}

if (typeof XMLHttpRequest === 'undefined') {
	var fs = require('fs')
	var sampleData = JSON.parse(fs.readFileSync(__dirname + '/samples/study.json'))
} else {
	var xhr = new XMLHttpRequest()
	xhr.open('GET', 'samples/study.json', false)
	xhr.send()
	var sampleData = JSON.parse(xhr.responseText)
}

var serialize = dpack.serialize
var parse = dpack.parse
var parseLazy = dpack.parseLazy
var createParseStream = dpack.createParseStream
var createSerializeStream = dpack.createSerializeStream
var asBlock = dpack.asBlock
var Options = dpack.Options
var ITERATIONS = 1000

suite('dpack basic tests', function(){
	test('serialize/parse data', function(){
		var data = {
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
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test('mixed array', function(){
		var data = [
			'one',
			'two',
			'one',
			10,
			11,
			null,
			true,
			'three',
			'one'
		]
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test('serialize/parse sample data', function(){
		var data = sampleData
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})

	test('write function', function() {
		serialize({ test: function() { console.log('just do not error') }})
	})

	test('extended class', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2
		}
		var instance = new Extended()
		instance.value = 4
		var data = {
			extendedInstance: instance
		}
		// TODO: create two of these
		var options = new Options()
		options.addExtension(Extended, 'Extended')
		var serialized = serialize(data, options)
		var parsed = parse(serialized, options)
		assert.equal(parsed.extendedInstance.getDouble(), 8)
	})

	test('extended class as root', function(){
		function Extended() {

		}
		Extended.prototype.getDouble = function() {
			return this.value * 2
		}
		var instance = new Extended()
		instance.value = 4
		var options = new Options()
		options.addExtension(Extended, 'Extended')
		var serialized = serialize(instance, options)
		var parsed = parse(serialized, options)
		assert.equal(parsed.getDouble(), 8)
	})

	test('set/map/date', function(){
		var map = new Map()
		map.set(4, 'four')
		map.set('three', 3)

		var set = new Set()
		set.add(1)
		set.add('2')
		set.add({ name: 3})

		var data = {
			map: map,
			set: set,
			date: new Date(1532219539819)
		}
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.equal(parsed.map.get(4), 'four')
		assert.equal(parsed.map.get('three'), 3)
		assert.equal(parsed.date.getTime(), 1532219539819)
		assert.isTrue(parsed.set.has(1))
		assert.isTrue(parsed.set.has('2'))
		assert.isFalse(parsed.set.has(3))
	})

	test('set/map/date as root', function(){
		var map = new Map()
		map.set(4, 'four')
		map.set('three', 3)

		var set = new Set()
		set.add(1)
		set.add('2')
		set.add({ name: 3})

		var serialized = serialize(map)
		var parsedMap = parse(serialized)
		serialized = serialize(set)
		var parsedSet = parse(serialized)
		serialized = serialize(new Date(1532219539819))
		var parsedDate = parse(serialized)
		assert.equal(parsedMap.get(4), 'four')
		assert.equal(parsedMap.get('three'), 3)
		assert.equal(parsedDate.getTime(), 1532219539819)
		assert.isTrue(parsedSet.has(1))
		assert.isTrue(parsedSet.has('2'))
		assert.isFalse(parsedSet.has(3))
	})

	test('numbers', function(){
		var data = {
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
		var serialized = serialize(data)
		var parsed = parse(serialized)
		assert.deepEqual(parsed, data)
	})


	test.skip('big utf8', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = serialize(data, { utf8: true })
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = parse(serialized, { utf8: true })
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})

	test.skip('with block', function() {
		var testString = "[AhCommentsPDdDataGBqtBkDescription XEPS for Brugada SyndromeBdName PNew Bayesian NMADeOwnerpAfScopesQ[DfClientpDfDeletesDkDocumentSet[CbId2\u000f\u0003\u0019oHBdName XEPS for Brugada SyndromeBgGestalt XEPS for Brugada SyndromeBdTypehData SetIDeOwnerUJCbId2</\u0002YH PBrugada Syndrome PBrugada SyndromemDisease StateU2</\u0002I \\Cardiology/Vascular Diseases \\Cardiology/Vascular Diseases PTherapeutic AreaT2</\u0002HfGlobalfGlobalfGlobal]DdEditsDdTeampKDdTypeSJ4#\u0010\"HhCompoundhCompoundDdUserUJ8:q Wkzyp@doctorevidence.comhKris ZypdUserUyjTechnologyjTechnologyhDivisionTwoDoctor EvidenceoDoctor EvidencefClientDdViewrJ4#\u0010'_]DfStatusSJ4#\u0010\"FcN/AcN/AAdTagsPKR1\u0019\u000f.IlBayesian NMAU8:qyyxUyzzyTw{{zJ8\u0010\u0007\u0004EBgCreated \\2018-11-13T19:31:22.0224266ZBgUpdated \\2018-11-13T19:31:22.3505650ZDfLockedsG\u0010\u0014PZDgfiltersQDgstudiesXBdtype QStudy Set FiltersDhexpandedYDminterventionsrDhoutcomesrDdyearrDocharacteristicssDjstudyLevelsDestudysDfphasessDlparticipantssDfdesignsBdnamekNew FiltersAeorderZBpdyearminterventionsocharacteristicshoutcomesjstudyLevelestudyfphaseslparticipantsfdesignzDfconfigYHDdyearUIDhexpandedrDmnoSelectedMinrDmnoSelectedMaxrCcmin0\u001fTCcmax0\u001fcJDminterventionsRIsAjpredicatesQXBisubgroupsgexcludeD RexcludeOverlappingrAigroupTypeQBpfSingleKBdtypecanyAgclausesQRKtAevaluePDnshowComparatorrDjcomparatorRKtLAgclausesQRKtMAevaluePDgexcludeQLQRtPNDocharacteristicsQIsODhoutcomesQIs\u0000PDjstudyLevelQIs\u0000QDestudyQIs\u0000RDfphasesQIs\u0000SDlparticipantsRIsCetotalt\u0000TDfdesignQIsDflockedrDhdisabledsClorderVersionuDeviewsQ\u0000UDgstudiesWKhAnalysis\u0000VBdnameiNew Views\u0000WAeorderRBpocharacteristicsjstudyLevel\u0000XDfconfigRNQr\u0000PQs\u0000YDflockedr\u0000ZDhdisableds\u0000[DhexpandedR\u0000\\Docharacteristicsr\u0000]DjstudyLevels\u0000V PNew Bayesian NMAAfgroupsP\u0000^AhoutcomesP\u0000X[BmconfigVersionj10/07/2016Bgversionc0.7BemodeldconsBivalueType`BhrateTypegPersonsBklinearModelfrandomDdisSIsDlincludeANOHEsDlomScaleValuepDghyPriorpDlhyPriorFirstpDmhyPriorSecondpBkmeasureContcRMDDomeasureComputedpBjmeasureBinbORBkmeasureRatebHRCfnChainvCdthin~CenIter48dCfnAdapt1\u000eLD SincludeUnanalyzables]ChpositiontKlBayesian NMADgrenamesPDhbaselinep]"
		var data = parse(testString)
		assert.isTrue(typeof data.Data == 'object')
	})

	test('performance msgpack-lite', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = encode(data)
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = decode(serialized)
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})

	test('performance JSON.parse', function() {
		this.timeout(10000)
		var data = sampleData
		var serialized = typeof Buffer === 'undefined' ? JSON.stringify(data) : Buffer.from(JSON.stringify(data))
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = JSON.parse(serialized)
			//parsed = JSON.parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})
	test('performance', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = serialize(data)
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		//console.log({ shortRefCount, longRefCount })
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = parse(serialized)
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})
	test('performance V8 serialize', function() {
		var v8 = require('v8')
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = v8.serialize(data)
			//var serializedGzip = deflateSync(serialized)
		}
	})
	test('performance V8 deserialize', function() {
		var v8 = require('v8')
		var data = sampleData
		this.timeout(10000)
		var serialized = v8.serialize(data)
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		//console.log({ shortRefCount, longRefCount })
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = v8.deserialize(serialized)
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})
	test('performance JSON.stringify', function() {
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = typeof Buffer === 'undefined' ? JSON.stringify(data) : Buffer.from(JSON.stringify(data))
			//var serializedGzip = deflateSync(serialized)
		}
	})


	test('performance serialize', function() {
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = serialize(data)
			//var serializedGzip = deflateSync(serialized)
		}
	})
	test('performance encode msgpack-lite', function() {
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = encode(data)
			var serializedGzip = deflateSync(serialized)
		}
	})
})
