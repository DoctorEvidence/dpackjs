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
var createSharedStructure = dpack.createSharedStructure
var readSharedStructure = dpack.readSharedStructure
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

	test('utf16', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = serialize(data, { encoding: 'utf16le' })
		var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		var parsed
		parsed = parse(serialized, { encoding: 'utf16le' })
		assert.deepEqual(parsed, data)
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = parse(serialized, { encoding: 'utf16le' })
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
		//var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		//console.log('deflate size', serializedGzip.length)
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = JSON.parse(serialized)
			//parsed = JSON.parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})
	test.only('performance shared', function() {
		this.timeout(10000)
		var data = sampleData
		//sharedStructure = undefined
		var sharedStructure = readSharedStructure(fs.readFileSync('C:/DocData/portal/shared-structure/Study.dpack'))
		debugger
		var serialized = serialize(data, { shared: sharedStructure })
		//var serialized = serialize(data)
		var serializedGzip = deflateSync(serialized)
		debugger
		console.log('size', serialized.length)
		console.log('deflate size', serializedGzip.length)
		//console.log({ shortRefCount, longRefCount })
		var parsed
		for (var i = 0; i < ITERATIONS; i++) {
			parsed = parse(serialized, { shared: sharedStructure })
			//parsed = parse(inflateSync(serializedGzip))
			parsed.Settings
		}
	})
	test('performance', function() {
		var data = sampleData
		this.timeout(10000)
		var serialized = serialize(data)
		//var serializedGzip = deflateSync(serialized)
		console.log('size', serialized.length)
		//console.log('deflate size', serializedGzip.length)
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
		var data = {"Enum":{"Id":14,"Name":"AttributeName"},"Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":415579},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":71175},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":61423549},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":141278106},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":70385}]}]},"BoundName":"VAS Pain on Nominated Activity Active Knees Calculated","LookupTable":{"Id":148364057,"Name":"VAS, Pain, On Nominated Activity, Active Knee, Calculated","Gestalt":"VAS, Pain, On Nominated Activity, Active Knee, Calculated"},"LookupTableId":148364057,"Scope":{"Id":107228406,"Name":"DocumentSet : Efficacy and Safety of Hylan G-F 20 vs Steroid Injection for OA: A Systematic Literature Review","Gestalt":"DocumentSet : Efficacy and Safety of Hylan G-F 20 vs Steroid Injection for OA: A Systematic Literature Review","Type":"DocumentSet"},"ScopeId":107228406,"Synonyms":[{"Id":70385,"Name":"Calculated","Gestalt":"Calculated"},{"Id":71175,"Name":"Pain","Gestalt":"Pain"},{"Id":415579,"Name":"VAS","Gestalt":"VAS"},{"Id":61423549,"Name":"on Nominated Activity","Gestalt":"on Nominated Activity"},{"Id":141278106,"Name":"Active Knees","Gestalt":"Active Knees"}],"SynonymsCount":5,"Workflows":[],"WorkflowsCount":0,"Id":148434563,"Created":"2019-03-12T17:46:28.8558375Z","Updated":"2019-03-12T21:36:52.1289574Z","CreatorId":null,"VersionNo":4,"Locked":false,"Gestalt":"VAS Pain on Nominated Activity Active Knees Calculated"}
		this.timeout(10000)
		for (var i = 0; i < 30000; i++) {
			var serialized = typeof Buffer === 'undefined' ? JSON.stringify(data) : Buffer.from(JSON.stringify(data))
			//var serializedGzip = deflateSync(serialized)
		}
	})


	test.only('performance serialize', function() {
		var data = sampleData
		this.timeout(10000)
		var sharedGenerator = createSharedStructure()
		serialize(data, { shared: sharedGenerator })
		sharedGenerator.iterations = 1
		var serialized = sharedGenerator.serializeCommonStructure()
		var sharedStructure = readSharedStructure(fs.readFileSync('C:/DocData/portal/shared-structure/Study.dpack'))
		var td = new TextDecoder()
		//var sharedStructure = readSharedStructure(td.decode(new Uint8Array([126,60,121,98,73,100,119,102,80,104,97,115,101,115,60,60,118,98,73,100,120,100,78,97,109,101,121,100,84,105,109,101,118,104,84,105,109,101,68,101,115,99,62,62,118,104,77,101,116,97,100,97,116,97,60,119,103,68,101,115,105,103,110,115,60,120,112,62,119,101,84,121,112,101,115,60,120,112,62,118,104,65,98,115,116,114,97,99,116,120,103,65,99,114,111,110,121,109,118,103,65,117,116,104,111,114,115,120,106,67,111,99,104,114,97,110,101,73,68,120,111,67,111,114,112,111,114,97,116,101,65,117,116,104,111,114,120,103,67,111,117,110,116,114,121,118,106,67,117,115,116,111,109,68,97,116,97,120,108,68,97,116,97,98,97,115,101,84,121,112,101,118,99,68,79,73,118,32,85,69,109,98,97,115,101,65,99,99,101,115,115,105,111,110,78,117,109,98,101,114,118,106,69,114,114,97,116,97,84,101,120,116,118,107,70,117,108,108,84,101,120,116,85,82,76,120,107,73,110,115,116,105,116,117,116,105,111,110,118,100,73,83,83,78,120,101,73,115,115,117,101,120,108,74,111,117,114,110,97,108,84,105,116,108,101,121,105,77,101,100,108,105,110,101,73,68,120,100,77,101,83,72,120,101,80,97,103,101,115,120,32,81,80,97,114,101,110,116,67,104,105,108,100,83,116,97,116,117,115,121,104,80,97,114,101,110,116,73,68,120,111,80,117,98,108,105,99,97,116,105,111,110,68,97,116,101,121,111,80,117,98,108,105,99,97,116,105,111,110,89,101,97,114,120,103,80,117,98,84,121,112,101,121,110,82,101,102,101,114,101,110,99,101,83,116,117,100,121,120,32,81,83,101,99,111,110,100,97,114,121,83,111,117,114,99,101,73,68,118,102,83,111,117,114,99,101,120,109,84,97,83,116,117,100,121,68,101,115,105,103,110,118,101,84,105,116,108,101,121,108,84,114,105,97,108,79,117,116,99,111,109,101,120,102,86,111,108,117,109,101,121,98,73,100,118,103,67,114,101,97,116,101,100,121,105,86,101,114,115,105,111,110,78,111,118,105,68,105,103,105,116,105,122,101,100,118,102,69,109,116,114,101,101,120,110,67,111,108,108,101,99,116,105,111,110,84,121,112,101,62,118,32,80,73,110,116,101,114,110,97,108,77,101,116,97,100,97,116,97,123,91,60,118,32,85,79,114,105,103,105,110,97,108,32,84,101,120,116,32,84,97,115,107,32,73,100,120,32,83,79,114,105,103,105,110,97,108,32,70,82,32,84,97,115,107,32,73,100,119,108,68,111,99,117,109,101,110,116,83,101,116,115,60,121,112,62,118,107,72,97,115,70,117,108,108,84,101,120,116,120,106,73,109,112,111,114,116,84,121,112,101,118,110,69,110,99,114,121,112,116,101,100,82,101,102,73,100,118,103,85,112,100,97,116,101,100,118,32,100,79,114,105,103,105,110,97,108,32,69,114,114,111,114,32,82,101,112,111,114,116,32,45,32,76,111,119,32,80,114,105,111,114,105,116,121,62,119,102,71,114,111,117,112,115,60,60,118,98,73,100,119,109,73,110,116,101,114,118,101,110,116,105,111,110,115,60,60,118,98,73,100,121,100,78,97,109,101,119,106,84,114,101,97,116,109,101,110,116,115,60,60,118,98,73,100,120,101,80,104,97,115,101,119,103,68,111,115,97,103,101,115,60,60,118,98,73,100,120,100,84,121,112,101,120,100,85,110,105,116,118,106,68,111,115,97,103,101,84,121,112,101,62,62,62,62,62,62,118,101,82,101,102,73,100,118,108,79,114,105,103,105,110,97,108,78,97,109,101,118,106,73,115,83,117,98,71,114,111,117,112,118,110,73,115,73,110,116,101,114,118,101,110,116,105,111,110,119,32,81,79,118,101,114,108,97,112,112,105,110,103,71,114,111,117,112,115,60,62,62,62,118,104,83,101,99,116,105,111,110,115,60,118,104,79,117,116,99,111,109,101,115,60,119,100,82,111,119,115,60,123,91,60,118,98,73,100,121,100,78,97,109,101,119,101,67,101,108,108,115,60,60,118,98,73,100,120,101,71,114,111,117,112,121,97,78,120,103,80,111,112,78,97,109,101,120,102,83,116,97,116,117,115,121,102,78,117,109,98,101,114,121,103,80,101,114,99,101,110,116,121,98,83,68,62,62,121,100,84,105,109,101,118,105,73,115,79,117,116,99,111,109,101,118,106,73,115,80,111,115,105,116,105,118,101,120,104,67,97,116,101,103,111,114,121,120,100,84,121,112,101,120,103,80,111,112,84,121,112,101,120,106,68,101,102,105,110,105,116,105,111,110,120,100,85,110,105,116,120,102,77,101,116,104,111,100,62,62,62,118,105,73,110,99,108,117,115,105,111,110,60,119,100,82,111,119,115,60,60,118,98,73,100,121,100,78,97,109,101,120,100,84,121,112,101,121,103,80,101,114,99,101,110,116,118,32,80,73,115,67,104,97,114,97,99,116,101,114,105,115,116,105,99,120,104,67,97,116,101,103,111,114,121,118,106,68,101,102,105,110,105,116,105,111,110,62,62,62,118,105,69,120,99,108,117,115,105,111,110,60,119,100,82,111,119,115,60,62,62,118,32,82,85,110,99,111,108,108,101,99,116,101,100,82,101,115,117,108,116,115,60,119,100,82,111,119,115,60,60,118,98,73,100,121,100,78,97,109,101,120,100,84,121,112,101,121,101,83,116,97,116,115,118,32,80,73,115,67,104,97,114,97,99,116,101,114,105,115,116,105,99,120,111,85,110,99,111,108,108,101,99,116,101,100,84,121,112,101,118,105,73,115,79,117,116,99,111,109,101,118,108,83,117,98,103,114,111,117,112,78,97,109,101,60,121,100,78,97,109,101,62,62,62,62,118,106,83,116,117,100,121,76,101,118,101,108,60,119,100,82,111,119,115,60,60,118,98,73,100,121,100,78,97,109,101,120,104,67,97,116,101,103,111,114,121,119,101,67,101,108,108,115,60,60,118,98,73,100,118,101,86,97,108,117,101,121,102,78,117,109,98,101,114,118,108,73,115,68,101,102,97,117,108,116,80,111,112,121,103,80,101,114,99,101,110,116,120,105,79,98,106,101,99,116,105,118,101,118,107,68,101,115,99,114,105,112,116,105,111,110,120,103,80,111,112,78,97,109,101,121,97,78,119,102,82,97,110,103,101,115,60,60,118,100,84,121,112,101,118,99,76,111,119,118,100,85,110,105,116,118,100,72,105,103,104,62,62,62,62,120,100,84,121,112,101,120,103,80,111,112,84,121,112,101,118,32,80,73,115,67,104,97,114,97,99,116,101,114,105,115,116,105,99,120,100,85,110,105,116,62,62,62,118,106,71,114,111,117,112,76,101,118,101,108,60,119,100,82,111,119,115,60,60,120,98,73,100,119,101,67,101,108,108,115,60,60,118,98,73,100,120,101,71,114,111,117,112,121,103,80,101,114,99,101,110,116,121,102,78,117,109,98,101,114,118,108,73,115,68,101,102,97,117,108,116,80,111,112,118,101,86,97,108,117,101,121,100,78,97,109,101,121,107,83,117,98,103,114,111,117,112,82,111,119,118,108,83,117,98,103,114,111,117,112,78,97,109,101,60,121,100,78,97,109,101,62,118,32,80,83,117,98,103,114,111,117,112,67,97,116,101,103,111,114,121,60,121,100,78,97,109,101,62,120,103,80,111,112,78,97,109,101,121,97,78,119,102,82,97,110,103,101,115,60,60,118,100,84,121,112,101,118,99,76,111,119,60,121,102,78,117,109,98,101,114,62,120,100,85,110,105,116,118,100,72,105,103,104,60,121,102,78,117,109,98,101,114,62,62,62,121,98,83,68,62,62,120,100,84,121,112,101,121,100,78,97,109,101,120,103,80,111,112,84,121,112,101,118,32,84,73,115,83,117,98,103,114,111,117,112,68,101,115,99,114,105,112,116,111,114,120,100,85,110,105,116,62,62,62,118,32,81,73,110,116,101,114,118,101,110,116,105,111,110,76,101,118,101,108,60,119,100,82,111,119,115,60,60,120,98,73,100,119,101,67,101,108,108,115,60,60,118,98,73,100,121,105,84,105,109,101,80,111,105,110,116,118,102,68,111,115,97,103,101,120,105,84,114,101,97,116,109,101,110,116,120,101,86,97,108,117,101,118,108,73,110,116,101,114,118,101,110,116,105,111,110,62,62,120,100,84,121,112,101,121,100,78,97,109,101,62,62,62,118,111,67,104,97,114,97,99,116,101,114,105,115,116,105,99,115,60,119,100,82,111,119,115,60,60,118,98,73,100,121,100,78,97,109,101,119,101,67,101,108,108,115,60,60,118,98,73,100,120,101,71,114,111,117,112,121,97,78,120,103,80,111,112,78,97,109,101,120,102,83,116,97,116,117,115,121,102,78,117,109,98,101,114,121,103,80,101,114,99,101,110,116,121,98,83,68,62,62,121,100,84,105,109,101,118,32,80,73,115,67,104,97,114,97,99,116,101,114,105,115,116,105,99,120,104,67,97,116,101,103,111,114,121,118,106,68,101,102,105,110,105,116,105,111,110,120,100,84,121,112,101,120,103,80,111,112,84,121,112,101,120,103,82,111,119,84,121,112,101,120,100,85,110,105,116,118,106,73,115,80,111,115,105,116,105,118,101,120,102,77,101,116,104,111,100,62,62,62,62,121,106,79,114,105,103,105,110,97,108,73,100,119,32,81,83,117,112,112,108,101,109,101,110,116,97,108,70,105,108,101,115,119,104,77,101,97,115,117,114,101,115,60,60,118,98,73,100,120,100,84,121,112,101,119,100,76,101,102,116,60,62,119,101,82,105,103,104,116,60,62,62,62,62])))
		//var sharedStructure = readSharedStructure(serialized)

		var td = new TextDecoder()
		for (var i = 0; i < ITERATIONS; i++) {
			serialized = serialize(data, { shared: sharedStructure })
			//var serialized = serialize(data)
			//var serializedGzip = deflateSync(serialized)
		}
		//console.log('serialized', serialized.length, global.propertyComparisons)
	})
	test('performance encode msgpack-lite', function() {
		var data = sampleData
		this.timeout(10000)
		for (var i = 0; i < ITERATIONS; i++) {
			var serialized = encode(data)
			var serializedGzip = deflateSync(serialized)
		}
	})

	test('shared structure', function() {
		debugger
		var testData = [{"Enum":{"Id":14,"Name":"AttributeName"},"Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":415579},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":71175},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":61423549},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":141278106},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":70385}]}]},"BoundName":"VAS Pain on Nominated Activity Active Knees Calculated","LookupTable":{"Id":148364057,"Name":"VAS, Pain, On Nominated Activity, Active Knee, Calculated","Gestalt":"VAS, Pain, On Nominated Activity, Active Knee, Calculated"},"LookupTableId":148364057,"Scope":{"Id":107228406,"Name":"DocumentSet : Efficacy and Safety of Hylan G-F 20 vs Steroid Injection for OA: A Systematic Literature Review","Gestalt":"DocumentSet : Efficacy and Safety of Hylan G-F 20 vs Steroid Injection for OA: A Systematic Literature Review","Type":"DocumentSet"},"ScopeId":107228406,"Synonyms":[{"Id":70385,"Name":"Calculated","Gestalt":"Calculated"},{"Id":71175,"Name":"Pain","Gestalt":"Pain"},{"Id":415579,"Name":"VAS","Gestalt":"VAS"},{"Id":61423549,"Name":"on Nominated Activity","Gestalt":"on Nominated Activity"},{"Id":141278106,"Name":"Active Knees","Gestalt":"Active Knees"}],"SynonymsCount":5,"Workflows":[],"WorkflowsCount":0,"Id":148434563,"Created":"2019-03-12T17:46:28.8558375Z","Updated":"2019-03-12T21:36:52.1289574Z","CreatorId":null,"VersionNo":4,"Locked":false,"Gestalt":"VAS Pain on Nominated Activity Active Knees Calculated"},
			{"Enum":{"Id":14,"Name":"AttributeName"},"extra": 3, "Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":412832}]}]},"BoundName":"thrombocytopenia,","LookupTable":{"Id":1004902,"Name":"​​All grades: Haematological, Thrombocytopenia","Gestalt":"Thrombocytopenia"},"LookupTableId":1004902,"Scope":{"Id":67058053,"Name":"DocumentSet : Global","Gestalt":"DocumentSet : Global","Type":"DocumentSet"},"ScopeId":67058053,"Synonyms":[{"Id":412832,"Name":"thrombocytopenia,","Gestalt":"thrombocytopenia,"}],"SynonymsCount":1,"Workflows":[],"WorkflowsCount":0,"Id":67096694,"Created":"2017-02-11T04:10:55.1825881Z","Updated":"2017-02-11T04:10:55.1895882Z","CreatorId":null,"VersionNo":1,"Locked":false,"Gestalt":"thrombocytopenia,"},
			{"Enum":{"Id":14,"Name":"AttributeName"},"extra": 4, "Binding":{"IsBound":true,"Phrases":[{"Conjunction":"or","Terms":[{"IsDisplaySynonym":false,"IsRoot":true,"IsSubgroup":false,"SynonymId":6714096},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":5430815},{"IsDisplaySynonym":false,"IsRoot":false,"IsSubgroup":false,"SynonymId":1373198}]}]},"BoundName":"Number of Treatments Anti-VEGF Agents Cumulative","LookupTable":{"Id":6686299,"Name":"# Injections, Cumulative Anti-VEGF treatments"},"LookupTableId":6686299,"Scope":{"Id":67058053,"Name":"DocumentSet : Global","Gestalt":"DocumentSet : Global","Type":"DocumentSet"},"ScopeId":67058053,"Synonyms":[{"Id":1373198,"Name":"Cumulative","Gestalt":"Cumulative"},{"Id":5430815,"Name":"Anti-VEGF Agents","Gestalt":"Anti-VEGF Agents"},{"Id":6714096,"Name":"Number of Treatments","Gestalt":"Number of Treatments"}],"SynonymsCount":3,"Workflows":[],"WorkflowsCount":0,"Id":67096987,"Created":"2017-02-11T04:10:55.3406141Z","Updated":"2017-02-11T04:10:55.3595894Z","CreatorId":null,"VersionNo":1,"Locked":false,"Gestalt":"Number of Treatments Anti-VEGF Agents Cumulative"}]
		var sharedGenerator = createSharedStructure()
		serialize(testData[0], { shared: sharedGenerator })
		serialize(testData[1], { shared: sharedGenerator })
		serialize(testData[2], { shared: sharedGenerator })
		var serialized = sharedGenerator.serializeCommonStructure()
		var sharedStructure = readSharedStructure(serialized)
		var serializedWithShared = serialize(testData[0], { shared: sharedStructure })
		var serializedWithShared1 = serialize(testData[1], { shared: sharedStructure })
		var serializedWithShared2 = serialize(testData[2], { shared: sharedStructure })
		var parsed = parse(serializedWithShared, { shared: sharedStructure })
		assert.deepEqual(parsed, testData[0])
		var parsed = parse(serializedWithShared1, { shared: sharedStructure })
		assert.deepEqual(parsed, testData[1])
		var parsed = parse(serializedWithShared2, { shared: sharedStructure })
		assert.deepEqual(parsed, testData[2])
	})
})
