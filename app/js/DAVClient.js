/*
 * From github; hacked around to make it work by CC
 */
const _XML_CHAR_MAP = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;'
};

function _escapeXml(s) {
  return s.replace(/[<>&"']/g, function (ch) {
    return _XML_CHAR_MAP[ch];
  });
}

function _parseClarkNotation(propertyName) {
  const result = propertyName.match(/^{([^}]+)}(.*)$/);
  if (!result)
    return undefined;

  return {
    name: result[2],
    namespace: result[1]
  };
}

/**
 * Parses a property node.
 *
 * Either returns a string if the node only contains text, or returns an
 * array of non-text subnodes.
 *
 * @param {Object} propNode node to parse
 * @return {string|Array} text content as string or array of subnodes, excluding text nodes
 */
function _parsePropNode(propNode) {
  let content = null;
  if (propNode.childNodes && propNode.childNodes.length > 0) {
    const subNodes = [];
    // filter out text nodes
    for (let j = 0; j < propNode.childNodes.length; j++) {
      const node = propNode.childNodes[j];
      if (node.nodeType === 1) {
        subNodes.push(node);
      }
    }
    if (subNodes.length) {
      content = subNodes;
    }
  }

  return content || propNode.textContent || propNode.text || '';
}

/**
 * Parses a multi-status response body.
 *
 * @param {string} xmlBody
 * @param {Array}
 */
function _parseMultiStatus(xmlBody, xmlNamespaces) {

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlBody, "application/xml");

  function resolver(foo) {
    let ii;
    for (ii in xmlNamespaces) {
      if (xmlNamespaces[ii] === foo) {
        return ii;
      }
    }
    return undefined;
  }

  const responseIterator = doc.evaluate(
    '/d:multistatus/d:response', doc, resolver,
    XPathResult.ANY_TYPE, null);

  const result = [];
  let responseNode = responseIterator.iterateNext();

  while (responseNode) {

    const response = {
      href: null,
      propStat: []
    };

    response.href = doc.evaluate('string(d:href)', responseNode, resolver, XPathResult.ANY_TYPE, null).stringValue;

    const propStatIterator = doc.evaluate('d:propstat', responseNode, resolver, XPathResult.ANY_TYPE, null);
    let propStatNode = propStatIterator.iterateNext();

    while (propStatNode) {
      const propStat = {
        status: doc.evaluate('string(d:status)', propStatNode, resolver, XPathResult.ANY_TYPE, null).stringValue,
        properties: {}
      };

      const propIterator = doc.evaluate('d:prop/*', propStatNode, resolver, XPathResult.ANY_TYPE, null);

      let propNode = propIterator.iterateNext();
      while (propNode) {
        const content = _parsePropNode(propNode);
        propStat.properties['{' + propNode.namespaceURI + '}' + propNode.localName] = content;
        propNode = propIterator.iterateNext();

      }
      response.propStat.push(propStat);
      propStatNode = propStatIterator.iterateNext();

      
    }

    result.push(response);
    responseNode = responseIterator.iterateNext();

  }

  return result;

}

/**
 * Renders a "d:set" block for the given properties.
 *
 * @param {Object.<String,String>} properties
 * @return {String} XML "<d:set>" block
 */
function _renderPropSet(properties, xmlNamespaces) {
  let body = '  <d:set>\n' +
      '   <d:prop>\n';

  for (const ii in properties) {
    if (!Object.hasOwn(properties, ii)) {
      continue;
    }

    const property = _parseClarkNotation(ii);
    let propName;
    let propValue = properties[ii];
    if (xmlNamespaces[property.namespace]) {
      propName = xmlNamespaces[property.namespace] + ':' + property.name;
    } else {
      propName = 'x:' + property.name + ' xmlns:x="' + property.namespace + '"';
    }

    // TODO: hard-coded for now until we allow properties to
    // specify whether to be escaped or not
    if (propName !== 'd:resourcetype') {
      propValue = _escapeXml(propValue);
    }
    body += '      <' + propName + '>' + propValue + '</' + propName + '>\n';
  }
  body += '    </d:prop>\n';
  body += '  </d:set>\n';
  return body;
}

class DAVClient {
  constructor(options) {
    this.baseUrl = null;
    this.userName = null;
    this.password = null;
    this.xmlNamespaces = {
      'DAV:': 'd'
    };

    for (const i in options) {
      this[i] = options[i];
    }
  }

  /**
   * Generates a propFind request.
   *
   * @param {string} url Url to do the propfind request on
   * @param {Array} properties List of properties to retrieve.
   * @param {string} depth "0", "1" or "infinity"
   * @param {Object} [headers] headers
   * @return {Promise}
   */
  propFind(url, properties, depth, headers) {

    if (typeof depth === "undefined")
      depth = '0';

    // depth header must be a string, in case a number was passed in
    depth = String(depth);

    headers = headers || {};

    headers['Depth'] = depth;
    headers['Content-Type'] = 'application/xml; charset=utf-8';

    let body =
        '<?xml version="1.0"?>\n' +
        '<d:propfind ';
    let namespace;
    for (namespace in this.xmlNamespaces) {
      body += ' xmlns:' + this.xmlNamespaces[namespace] + '="' + namespace + '"';
    }
    body += '>\n' +
    '  <d:prop>\n';

    for (const ii in properties) {
      if (!Object.hasOwn(properties, ii)) {
        continue;
      }

      const property = _parseClarkNotation(properties[ii]);
      if (this.xmlNamespaces[property.namespace]) {
        body += '    <' + this.xmlNamespaces[property.namespace] + ':' + property.name + ' />\n';
      } else {
        body += '    <x:' + property.name + ' xmlns:x="' + property.namespace + '" />\n';
      }

    }
    body += '  </d:prop>\n';
    body += '</d:propfind>';

    return this.request('PROPFIND', url, headers, body).then(
      function (result) {

        if (depth === '0')
          return {
            status: result.status,
            body: result.body[0],
            xhr: result.xhr
          };

        return {
          status: result.status,
          body: result.body,
          xhr: result.xhr
        };
      }
    );
  }

  /**
   * Generates a propPatch request.
   *
   * @param {string} url Url to do the proppatch request on
   * @param {Object.<String,String>} properties List of properties to store.
   * @param {Object} [headers] headers
   * @return {Promise}
   */
  propPatch(url, properties, headers) {
    headers = headers || {};

    headers['Content-Type'] = 'application/xml; charset=utf-8';

    let body =
        '<?xml version="1.0"?>\n' +
        '<d:propertyupdate ';
    let namespace;
    for (namespace in this.xmlNamespaces) {
      body += ' xmlns:' + this.xmlNamespaces[namespace] + '="' + namespace + '"';
    }
    body += '>\n' + _renderPropSet(properties, this.xmlNamespaces);
    body += '</d:propertyupdate>';

    return this.request('PROPPATCH', url, headers, body)
    .then(
      result => {
        return {
          status: result.status,
          body: result.body,
          xhr: result.xhr
        };
      });
  }

  /**
   * Generates a MKCOL request.
   * If attributes are given, it will use an extended MKCOL request.
   *
   * @param {string} url Url to do the proppatch request on
   * @param {Object.<String,String>} [properties] list of properties to store.
   * @param {Object} [headers] headers
   * @return {Promise}
   */
  mkcol(url, properties, headers) {
    let body = '';
    headers = headers || {};
    headers['Content-Type'] = 'application/xml; charset=utf-8';

    if (properties) {
      body =
      '<?xml version="1.0"?>\n' +
      '<d:mkcol';
      let namespace;
      for (namespace in this.xmlNamespaces) {
        body += ' xmlns:' + this.xmlNamespaces[namespace] + '="' + namespace + '"';
      }
      body += '>\n' + this._renderPropSet(properties, this.xmlNamespaces);
      body += '</d:mkcol>';
    }

    return this.request('MKCOL', url, headers, body).then(
      result => {
        return {
          status: result.status,
          body: result.body,
          xhr: result.xhr
        };
      });
  }

  /**
   * Performs a HTTP request, and returns a Promise
   *
   * @param {string} method HTTP method
   * @param {string} url Relative or absolute url
   * @param {Object} headers HTTP headers as an object.
   * @param {string} body HTTP request body.
   * @return {Promise}
   */
  request(method, url, headers, body) {
    const self = this;
    const xhr = this.xhrProvider();
    headers = headers || {};
    if (this.userName) {
      headers['Authorization'] = 'Basic '
      + btoa(this.userName + ':' + this.password);
    }
    let turl = url;
    if (typeof URL !== "undefined") {
      try {
        turl = new URL(url, this.baseUrl).toString();
      } catch (e) {
        return Promise.reject(new Error(this.baseUrl + "/" + URL + ": " + e));
      }
    } else if (!/^[a-z]*:\/\//.test(turl))
      // Bit hacky, but it works
      turl = this.baseUrl + turl;

    xhr.open(method, turl, true);
    let ii;
    for (ii in headers) {
      xhr.setRequestHeader(ii, headers[ii]);
    }

    // Work around for edge
    if (body === undefined) {
      xhr.send();
    } else {
      xhr.send(body);
    }

    return new Promise(function (fulfill, reject) {

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) {
          return;
        }
        let resultBody = xhr.response;
        if (xhr.status === 207) {
          resultBody = _parseMultiStatus(
            xhr.response,
            self.xmlNamespaces);
        }

        fulfill({
          body: resultBody,
          status: xhr.status,
          xhr: xhr
        });

      };

      xhr.ontimeout = function () {

        reject(new Error('Timeout exceeded'));

      };
    });
  }

  /**
   * Returns an XMLHttpRequest object.
   *
   * This is in its own method, so it can be easily overridden.
   *
   * @return {XMLHttpRequest}
   */
  xhrProvider() {
    return new XMLHttpRequest();
  }
}

export { DAVClient }

