/** Copyright 2012 mocking@gmail.com

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

//returns a global variable or a property of a variable by name
function findNestedObject(path) {
  var i, obj = ctx;
  if((i = obj[path])) return i;

  i = 0;
  path = path.split(".");
  while(path[i] && (obj = obj[ path[i++] ]));
  return obj;  
}

//a mapping of uniquely generated numbers to objects
var nodeObjMap = {};
var nodeObjMapIdx = 1;

function hookObjectToNode(obj, node) {
  if(node.nodeType != 1) throw node;
  if(!node._relayAppId) {
    node._relayAppId = ++nodeObjMapIdx;
    nodeObjMap[nodeObjMapIdx] = obj;
    obj.relayBaseNode = node;
  }
}

function unhookObject(node) {
  node = node.relayBaseNode || node;
  var id = node._relayAppId;
  nodeObjMap[id].relayBaseNode = node._relayAppId = null;
  delete nodeObjMap[id];
}

function getObjectFromNode(node) {
  if(typeof node == "string") node = document.getElementById(node);
  return nodeObjMap[node._relayAppId];
}

function relayDelegate(a, b) {
  //"this" refers to the object to which this function gets attached (delegated)
  R(a, b, this);
}

var FUNCTION = "function";

R.start = R.initTree = function(root) {
  if(!root || !root.nodeType) root = ctx.document.body || ctx.document.documentElement;

  var node, appName, obj,
    list = root.getElementsByTagName("INS");

  for(var i = 0; i < list.length; i++) {
    node = list[i];
    if(!node._relayAppId) {
      if((appName = node.cite).substr(0, 3) == "js:") {
        appName = appName.substr(3);  //object names are stored as URIs in the CITE attribute: <INS CITE="js:com.acme.MyApp">
        obj = findNestedObject(appName);

        //we allow instantiating objects by these methods:
        //= new com.acme.MyApp()
        //= com.acme.MyApp.getInstance()
        if(typeof obj == FUNCTION) {
          obj = new obj(appName, node);

        } else if(typeof obj.getInstance == FUNCTION) {
          obj = obj.getInstance(appName, node);
          if(!obj) throw appName;
        }

        hookObjectToNode(obj, node);
        if(!obj.relay) obj.relay = relayDelegate;
      }
    }
  }
};

var ArraySlice = Array.prototype.slice;

function R(type, args, node) {
  args = ArraySlice.call(arguments, 1);
  node = args.pop();

  if(!node || node == ctx) throw type;  //node parameter was [Window] or null

  //we allow passing in an Event or JSObject instead of Node
  if(!node.nodeType) node = node.relayBaseNode || node.target || node.srcElement;

  var value, obj;
  if(typeof type == FUNCTION) {
    //we allow inline functions to run with the JSObject set as the scope: relay(function(){this.showMenu();}, this);
    while(node) {
      if(node._relayAppId && (obj = getObjectFromNode(node))) {
        return type.call(obj, event) || node;
      }
      node = node.parentNode;
    }

  } else {
    while(node) {
      if(node._relayAppId && (obj = getObjectFromNode(node)) && obj[type]) {
        value = obj[type].apply(obj, args);
        if(value != R.BUBBLE) return value || node;
      }
      node = node.parentNode;
    }
    return value || node;
  }
}

//export functions
R.findNestedObject = findNestedObject;
R.hookObjectToNode = hookObjectToNode;
R.unhookObject = unhookObject;
R.byId = R.getObjectFromNode = getObjectFromNode;
R.BUBBLE = {};

return R;

}(this);