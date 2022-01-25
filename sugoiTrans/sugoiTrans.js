var thisAddon = this;
var packageName = thisAddon.package.name;

var thisEngine = new TranslatorEngine({
	id:packageName,
	name:thisAddon.package.title,
	author:"Dreamsavior",
	version:thisAddon.package.version,
	description:thisAddon.package.description,
	batchDelay:1,
	mode: "rowByRow",
	targetUrl:"http://localhost:14366/",
	languages:{
		"en": "English",
		"ja": "Japanese"
	  },
	optionsForm:{
	  "schema": {
		"lineDelimiter": {
		  "type": "string",
		  "title": "Line delimiter",
		  "description": "Subtitute for new lines",
		  "default":"<br>"
		},
        "targetUrl": {
            "type": "string",
            "title": "Target URL(s)",
            "description": "Translator target URL. You can enter one ore more Sugoi Translator back-end URL. Translator++ will load balance the request across all instance of the services. Separate each entry with a new line.",
            "default":"http://localhost:14366/",
            "required":true
        },
		"maxParallelJob": {
            "type": "number",
            "title": "Max Parallel job",
            "description": "Maximum parallel job that run simultaneously.",
            "default":5,
            "required":true
        },
		"escapeAlgorithm": {
		  "type": "string",
		  "title": "Code Escaping Algorithm",
		  "description": "Escaping algorithm for inline code inside dialogues (not yet implemented, please wait for the future updates)",
		  "default":"",
		  "required":false,
		  "enum": [
				"",
				"hexPlaceholder",
				"agressiveSplitting"
			]
		}
	  },
	  "form": [
		{
		  "key": "lineDelimiter",
		  "onChange": function (evt) {
			var value = $(evt.target).val();
			thisEngine.update('lineDelimiter', value);
		  }
		},
        {
            "key": "targetUrl",
			"type": "textarea",
            "onChange": function (evt) {
              var value = $(evt.target).val();
			  var urls = value.replaceAll("\r", "").split("\n");
			  var validUrls = [];
			  for (var i in urls) {
				  if (!isValidHttpUrl(urls[i])) continue;
				  validUrls.push(urls[i]);
			  }
              thisEngine.update("targetUrl", validUrls.join("\n"));
			  $(evt.target).val(validUrls.join("\n"));
            }
        },
        {
            "key": "maxParallelJob",
            "onChange": function (evt) {
              var value = $(evt.target).val();
              thisEngine.update("maxParallelJob", parseInt(value));
            }
        },
		{
		  "key": "escapeAlgorithm",
		  "titleMap": {
			  "": "Default",
			  "hexPlaceholder": "Hex Placeholder",
			  "none": "No escaping"
		  },
		  "onChange": function (evt) {
			var value = $(evt.target).val();
			thisEngine.update("escapeAlgorithm", value);
			
		  }
		}		
	  ]
	}
});

thisEngine.lineDelimiter = thisEngine.lineDelimiter || "<br>";
thisEngine.maxParallelJob = thisEngine.maxParallelJob || 5;

class TextFilter extends HexPlaceholder {
	constructor(text) {
		super(text)

	}
}

TextFilter.prototype.generatePlaceholderId = function(number) {
	return "<br>";
}
  
TextFilter.prototype.getPlaceholder = function(stringKey) {
	if (!this.placeHoldersCopy) this.placeHoldersCopy = common.clone(this.placeHolders);
	// get replacement by the order of appearance
	if (Array.isArray(this.placeHoldersCopy) == false) return "";
	if (this.placeHoldersCopy.length == 0) return "";
	return this.placeHoldersCopy.shift();
}

function isValidHttpUrl(string) {
	let url;
	try {
	  url = new URL(string);
	} catch (_) {
	  return false;  
	}
  
	return url.protocol === "http:" || url.protocol === "https:";
}

thisEngine.getUrl = function() {
	if (!thisEngine.targetUrls) {
		thisEngine.targetUrl = thisEngine.targetUrl || "";
		var urls = thisEngine.targetUrl.replaceAll("\r", "").split("\n");
		thisEngine.targetUrls = [];
		for (var i in urls) {
			if (!isValidHttpUrl(urls[i])) continue;
			thisEngine.targetUrls.push(urls[i]);
		}
		thisEngine.selectedUrl = 0;
	}

	if (thisEngine.targetUrls.length == 1) return thisEngine.targetUrls[0];

	var result = thisEngine.targetUrls[thisEngine.selectedUrl];
	thisEngine.selectedUrl++;
	if (thisEngine.selectedUrl >= thisEngine.targetUrls.length-1) thisEngine.selectedUrl = 0;
	return result;
}

/**
 * @param  {Array} texts - Array of string text
 */

thisEngine.fetchTranslation = async function(texts) {
	var escape = (text)=> {
		text = text.replaceAll(/[\r\n]+/g, thisEngine.lineDelimiter || "<br>");
		return text;
	}
	
	var unescape = (text)=> {
		text = text.replaceAll(thisEngine.lineDelimiter || "<br>", "\n");
		text = text.replaceAll("<unk>", "");
		text = text.replaceAll("「br>", "\n");
		return text;
	}
	
	var translateNow = async (batchText)=> {
		var result = await fetch(thisEngine.getUrl(), {
			method		: 'post',
			body		: JSON.stringify({content: batchText, message: "translate sentences"}),
			headers		: { 'Content-Type': 'application/json' },
		});
		return await result.json();
	}

	var prosesJob = async (texts)=>{
		var translatedTexts = [];
		var promises = [];
		for (var i=0; i<texts.length; i++) {
			promises.push(
				new Promise(async (resolve, reject) => {
					var thisIndex	= i;
					var thisText 	= texts[i];
					var result 		= await translateNow(escape(thisText));
					result 			= unescape(result);
					translatedTexts[thisIndex] = result;
					resolve(result);
				})
			)
		}
		await Promise.all(promises);
		return translatedTexts;
	}

	if (Array.isArray(texts) == false) texts = [texts];
	thisEngine.maxParallelJob = thisEngine.maxParallelJob || 5;
	var results = [];
	var parts 	= common.arrayChunk(texts, thisEngine.maxParallelJob);
	for (var i=0; i<parts.length; i++) {
		results = results.concat(await prosesJob(parts[i]));
	}
	return results;
}

thisEngine.translate = async function(text, options) {
	console.log("==================================================");
	console.log("thisEngine.translate: ", text);

    if (thisEngine.isDisabled == true) return false;
    if (typeof text=='undefined') return text;
	var thisTranslator = this;
	thisTranslator.escapeAlgorithm = thisTranslator.escapeAlgorithm || "hexPlaceholder";

    options = options||{};
    // try to load saved configuration
    try {
        var savedSL = trans.getSl();
        var savedTL = trans.getTl();
    } catch(e) {
        var savedSL = undefined;
        var savedTL = undefined;
    }
    options.sl = options.sl||savedSL||'ja';
    options.tl = options.tl||savedTL||'en';
    options.onAfterLoading = options.onAfterLoading||function() {};
    options.onError = options.onError||function() {};
    options.always = options.always||function() {};
 
   

	//var textObj = thisTranslator.preProcessText(text, options);
	//console.warn("textObj", textObj);
    var data;
	await common.benchmark(async ()=>{
		data = await this.fetchTranslation(text, options.sl, options.tl);   
	})
    console.log("translation process is done with the result: ");
    console.log(data);
    
    var result = {
        'sourceText'		:"",
        'translationText'	:"",
        'source'			:[],
        'translation'		:[]
    };

	//hexPlaceholder
	//process the first index, since the texts is concenate into one text anyway
	//result.translationText 	= textObj.hexPlaceholder.restore(data[0]);
	result.source 			= text;
	result.translation 		= data;

	for (var i=0; i<result.translation.length; i++) {
		result.translation[i] = result.translation[i].split(thisTranslator.lineSubstitute).join($DV.config.lineSeparator);
	}
   
    console.log(result);
    if (typeof options.onAfterLoading == 'function') {
        options.onAfterLoading.call(thisTranslator, result, data);
    }   
   
}


window.trans[packageName] = thisEngine;

$(document).ready(function() {
	thisEngine.init();
});
