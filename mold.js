var Mold = {};

(function() {
  function splitTemplate(template) {
    var parts = [];
    function addString(string) {
      if (string.length)
        parts.push(string);
    }

    while (true) {
      var open = template.search(/[\[<]\?/);
      if (open == -1) {
        addString(template);
        break;
      }
      else {
        addString(template.slice(0, open));
        var close = template.indexOf("?" + (template.charAt(open) == "<" ? ">" : "]"), open + 2);
        if (close == -1) throw new Error("'<?' without matching '?>' in template.");
        var content = template.slice(open + 2, close), match = content.match(/^([\w\/]+)(?: ((?:\n|.)+))?$/);
        if (!match) throw new Error("Template command ('" + content + "') does not follow 'command [arguments]' format.");
        parts.push({command: match[1], args: match[2]});
        template = template.slice(close + 2);
      }
    }

    return parts;
  }

  var snippets, snippet;
  Mold.addSnippet = function addSnippet(f) {
    if (snippets) {
      snippets.push(f);
      return snippets.length - 1;
    }
  };

  var labels;
  Mold.setLabel = function setLabel(name, inArray) {
    return function() {
      if (!labels) labels = {};
      if (inArray) (labels[name] || (labels[name] = [])).push(this);
      else labels[name] = this;
    };
  };

  var HTMLspecial = {"<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;"};
  Mold.escapeHTML = function escapeHTML(text) {
    return String(text).replace(/[<>&\"]/g, function(ch) {return HTMLspecial[ch];});
  }
  var JSspecial = {"\"": "\\\"", "\\": "\\\\", "\f": "\\f", "\b": "\\b",
                   "\n": "\\n", "\t": "\\t", "\r": "\\r", "\v": "\\v"};
  Mold.escapeString = function escapeString(text) {
    return String(text).replace(/[\"\\\f\b\n\t\r\v]/g, function(ch) {return JSspecial[ch];});
  }

  Mold.bake = function bake(template) {
    var parts = splitTemplate(template);
    var func = ["[function(input){\nvar __out = [];\n"];
    var stack = [];

    function inLoop() {
      for (var i = 0; i < stack.length; i++)
        if (stack[i] == "for") return true;
      return false;
    }

    while (parts.length) {
      var cur = parts.shift();
      if (typeof cur == "string") {
        func.push("__out.push(\"" + Mold.escapeString(cur) + "\");\n");
        continue;
      }
      switch (cur.command) {

      case "text": case "t":
        func.push("__out.push(Mold.escapeHTML(" + cur.args + "));\n");
        break;
      case "html": case "h":
        func.push("__out.push(" + cur.args + ");\n");
        break;
      case "do": case "d":
        func.push(cur.args + "\n");
        break;

      case "if":
        stack.push("if");
        func.push("if (" + cur.args + ") {\n");
        break;
      case "elif":
        if (stack[stack.length - 1] != "if") throw new Error("'elif' without matching 'if' in template.");
        func.push("} else if (" + cur.args + ") {\n");
        break;
      case "else":
        if (stack[stack.length - 1] != "if") throw new Error("'else' without matching 'if' in template.");
        func.push("} else {\n");
        break;
      case "/if":
        if (stack.pop() != "if") throw new Error("'/if' without matching 'if' in template.");
        func.push("}\n");
        break;

      case "for":
        stack.push("for");
        var match = cur.args.match(/^([\w\$_]+) ((?:\n|.)+)$/);
        if (!match) throw new Error("Malformed arguments to 'for' form in template -- expected variable name followed by expression.");
        func.push("forEach(" + match[2] + ", function(" + match[1] + ") {\n");
        break;
      case "/for":
        if (stack.pop() != "for") throw new Error("'/for' without matching 'for' in template.");
        func.push("});\n");
        break;

      case "event":
        var match = cur.args.match(/^(\w+) ((?:\n|.)+)$/);
        if (!match) throw new Error("Malformed arguments to 'event' form in template -- expected event name followed by handler body.");
        func.push("__out.push(\"<var class=\\\"__mold \" + Mold.addSnippet(function(){addEventHandler(this, \"" + 
                  match[1] + "\", function(event) {\n" + match[2] + "\n});}) + \"\\\"></var>\");\n");
        break;
      case "run": case "r":
        func.push("__out.push(\"<var class=\\\"__mold \" + Mold.addSnippet(function(){" + cur.args + "}) + \"\\\"></var>\");\n");
        break;
      case "label": case "l":
        func.push("__out.push(\"<var class=\\\"__mold \" + Mold.addSnippet(Mold.setLabel(\"" + Mold.escapeString(cur.args) +
                  "\", " + inLoop() + ")) + \"\\\"></var>\");\n");
        break;

      default:
        throw new Error("Unrecognised template command: '" + cur.command + "'.");
      }
    }
    if (stack.length) throw new Error("Unclosed blocks in template (" + stack.join() + ").");

    func.push("return __out.join(\"\");\n}]");
    // The brackets are there to work around some weird IE6 behaviour.
    return window.eval(func.join(""))[0];
  };

  Mold.cast = function cast(target, mold, data) {
    snippets = [], snippet = 0, labels = null;
    target.innerHTML = mold(data);
    var varTags = target.getElementsByTagName("VAR"), array = [];
    // Copy tags into array -- FF modifies the varTags collection when you delete nodes in it.
    for (var i = 0; i < varTags.length; i++)
      array.push(varTags[i]);
    for (var i = 0; i < array.length; i++) {
      var varTag = array[i], match = varTag.className.match(/^__mold (\d+)$/);
      if (match) {
        snippets[match[1]].call(varTag.previousSibling || varTag.parentNode);
        varTag.parentNode.removeChild(varTag);
      }
    }

    var result = labels;
    labels = snippets = null;
    return result;
  };
})();