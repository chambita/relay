/** Copyright 2012 mocking@gmail.com * http://relay.github.com

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */

var relay = function(ctx) {
"use strict";

//a mapping of uniquely generated numbers to objects
var nodeObjMap = {};
var nodeObjMapIdx = 1;

var FUNCTION = "function",
    THIS_ERR = "invalid 'this'",
    RELAY_ERR = "onRelayError",
    ArraySlice = Array.prototype.slice;

//called by initAndHookObject() but can also be called by outsiders
R.hookObjectToNode = function(obj, node) {
  if(node.nodeType != 1) throw node;

  if(!node._relayAppId) {
    node._relayAppId = ++nodeObjMapIdx;
    nodeObjMap[nodeObjMapIdx] = obj;
    obj.relayBaseNode = node;
  }
};

//inverse of hookObjectToNode() but not used internally
R.unhookObject = function(node) {
  node = node.relayBaseNode || node;
  var id = node._relayAppId;
  nodeObjMap[id].relayBaseNode = node._relayAppId = null;
  delete nodeObjMap[id];
};

function getObjectFromNode(node) {
  if(typeof node == "string") node = ctx.document.getElementById(node);
  return nodeObjMap[node._relayAppId];
}

//starts parsing the children of a DOM node for INS elements with CITE attributes
var initTree = R.start = R.initTree = function(root) {
  if(!root || !root.nodeType) root = ctx.document.body || ctx.document.documentElement;

  var appName,
    i = 0,
    list = root.getElementsByTagName("INS"),
    node = (root.nodeName == "INS") ? root : list[i++],
    loadObject = R.loadObject;

  do {
    if(!node._relayAppId) {
      if((appName = node.cite).substr(0, 3) == "js:") {
        //object names are stored as URIs in the CITE attribute: <INS CITE="js:com.acme.MyApp">
        appName = appName.substr(3);

        if(appName.substr(0, 6) == "relay.") {
          if(appName == "relay.ignore") i += node.getElementsByTagName("INS").length;

        } else loadObject(appName, node);
      }
    }
  } while(node = list[i++]);

  return getObjectFromNode(root);
};

//this function can be overridden for requireJS
R.loadObject = function(appName, node) {
  //searches for a global variable or a property of a global variable by name
  var i, obj = ctx, path = appName;

  if((i = obj[path])) {  //if variable name is on the top level
    obj = i;

  } else {  //follows the dot notation to find objects in deeper levels
    i = 0;
    path = path.split(".");
    while(path[i] && (obj = obj[ path[i++] ]));
  }

  if(obj) R.initAndHookObject(obj, appName, node);
};

//only call this if you've overridden relay.loadObject() and need to call this manually
R.initAndHookObject = function(obj, appName, node) {
  //we allow instantiating objects by these methods:
  //= new com.acme.MyApp(appName, node)
  //= com.acme.MyApp.getInstance(appName, node)
  //otherwise we reference the object without instantiation

  if(typeof obj == FUNCTION) {
    obj = new obj(appName, node);
    //passing in the appName allows the object to map out further 
    //resources that are identified by the appName. e.g., templates

  } else if(typeof obj.getInstance == FUNCTION) {  //singleton method
    obj = obj.getInstance(appName, node);
    if(!obj) throw appName;
  }

  R.hookObjectToNode(obj, node);
};

//free all memory. Calling this is optional as browser should garbage collect
R.unload = function() {
  nodeObjMap = {};
};

//parse all decendents for INS elements and call a named method on them
R.forward = function(type, args, node) {
  args = ArraySlice.call(arguments, 1);
  node = args.pop();

  if(!node || node == ctx) throw THIS_ERR;

  //we allow passing in an Event or JSObject instead of Node
  if(!node.nodeType) node = node.relayBaseNode || (node.preventDefault && node.target) || node.srcElement || node;
  if(!node.nodeType) throw THIS_ERR;

  var obj, sub, err,
    root = node,
    i = 0,
    list = node.getElementsByTagName("INS");

  while(node) {
    try {
      while(node = list[i]) {
        if(node._relayAppId && (obj = getObjectFromNode(node)) && (sub = obj.subscribe) && sub[type]) {
          sub[type].apply(obj, args);
        }
        if(list[i] == node) i++;  //only increment if order of node has not shifted
      }
    } catch(e) {
      err = e;
      if(list[i] == node) i++;
    }
  }

  //pass errors outwards so that others can optionally detect them
  if(err) R(RELAY_ERR, err, type, root, root);
};

//body of the relay() function
function R(type, args, node) {
  args = ArraySlice.call(arguments, 1);
  node = args.pop();

  if(!node || node == ctx) throw THIS_ERR;

  //we allow passing in an Event or JSObject instead of Node
  if(!node.nodeType) node = node.relayBaseNode || (node.preventDefault && node.target) || node.srcElement || node;
  if(!node.nodeType) throw THIS_ERR;

  var value, obj, source = node;
  if(typeof type == FUNCTION) {
    //we allow inline functions to run with the JSObject set as the scope:
    //relay(function(){this.showMenu();}, this);
    while(node) {
      if(node._relayAppId && (obj = getObjectFromNode(node))) {
        return type.apply(obj, args) || obj;
      }
      node = node.parentNode;
    }

  } else {  //typeof "type" == string
    try {
      while(node) {
        if(node._relayAppId && (obj = getObjectFromNode(node)) && obj[type]) {
          value = obj[type].apply(obj, args);
          if(value != R.BUBBLE) return value || obj;
        }
        node = node.parentNode;
      }

      //optional flag (relay.strict=1) means all events must be consumed
      if(value != R.BUBBLE && R.strict) throw "relay.strict=1";

    } catch(e) {
      R(RELAY_ERR, e, type, node, args, source);
    }
    return value;
  }
}

//export functions
R.byId = R.getObjectFromNode = getObjectFromNode;
R.BUBBLE = {};

return R;

}(this);

//allows reusing the same event handler function for all nodes:
//  addEventListener("click", relay.handler, false)
//    --> relay("onclick", event, node)
//  addEventListener("keypress", relay.handler, false)
//    --> relay("onkeypress", event, node)
relay.handler = function(e) {
  e = e || event;
  relay("on" + e.type, e, e.target || e.srcElement);
};