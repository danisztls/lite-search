/*!
 * Fuse.js v6.4.6 - Lightweight fuzzy-search (http://fusejs.io)
 *
 * Copyright (c) 2021 Kiro Risk (http://kiro.me)
 * All Rights Reserved. Apache Software License 2.0
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import Fuse from 'fuse.js'

export default function Search(opts) {
  const defaults = {
    // comment keys that aren't going to be used.
    keys: [
      { name: "title", weight: 3 },
      { name: "description", weight: 2 }
    ],

    // optionally provide an alias when key names on JSON differ from what the script expects.
    aliases: [
      // { input: "title", output: "description" },
      // { input: "description", output: "title" }
    ],

    dataPath: "/index.json",
    // dataPath: "/" + basePath + lang + "/index.json",  // for multilingual 
    modalSelector: "#search > ul",
    formSelector: "#search",
    minInputLength: 0,
    matchStrategy: "fuzzy",
    maxResults: 10,
    maxContextLength: 250,
    includeMatches: false,  // NOTE: use 'exact' for matchStrategy
    showSectionOnTitle: true,
    modalFullscreen: false,
    debug: false
  }
  opts = Object.assign({}, defaults, opts)  // use defaults for missing opts

  let fuseInstance = initFuse()
  let formEl, inputEl, modalEl, bodyOverflow

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', DOMHandler, { passive: true })
  else
    DOMHandler()

  function DOMHandler() {
    modalEl = document.querySelector(opts.modalSelector)
    formEl  = document.querySelector(opts.formSelector)
    inputEl = formEl.querySelector("input")
    bodyOverflow = document.body.style.overflow
      
    // Prevent input interaction. Is removed when UI is initiated.
    inputEl.addEventListener("keydown", preventInteraction)
  
    fuseInstance
      .then(initUI)
      .then(inputEl.removeEventListener("keydown", preventInteraction))
      .catch(console.error)

    /** Prevent input interaction prior to UI initialization
     */
    function preventInteraction(event) {
      event.preventDefault()
    }
  }
  
  /** Initialize the Fuse.js instance
   *  check: https://fusejs.io/api/options.html
   */
  async function initFuse() {
    opts.fuse = {
      location: 0,
      distance: 0,
      ignoreLocation: true,
      ignoreFieldnorm: true,
      minMatchCharLength: 0,
      includeMatches: opts['includeMatches'],
      keys: opts['keys']
    }

    switch(opts.matchStrategy) {
      case ("fuzzy"):
        opts.fuse.threshold = 0.3
        opts.fuse.useExtendedSearch = false
        opts.fuse.findAllMatches = false
        break

      case ("exact"):
        opts.fuse.threshold = 0
        opts.fuse.useExtendedSearch = true
        opts.fuse.findAllMatches = true
        break
    }

    return fetchData()
      .then(data => {
        return new Fuse(data, opts.fuse)
      })

    /** Fetch data from a JSON endpoint
     *  @return {Object} - data for Fuse()
     */
    async function fetchData() {
      const request = new Request(opts.dataPath, {method: 'GET', cache: 'default'})

      return fetch(request)
        .then(response => {
          if (!response.ok) {
            throw new Error("HTTP error " + response.status)
          }
          return response.json()
        })
    }
  }
  
  /** Initialize the user interface
   *  @param {object} fuse - Fuse.js instance
   */
  function initUI(fuse) {
    class Modal {
      constructor(target, control) {
        this.target = target
        this.control = control
      }

      show() {
        if (this.target.hidden == true)
          this.target.hidden = false
          this.target.style.visibility = "visible"
          this.control.setAttribute("aria-expanded", "true")
      }

      hide() {
        if (this.target.hidden == false)
          this.target.hidden = true
          this.target.style.visibility = "hidden"
          this.control.setAttribute("aria-expanded", "false")
      }

      isHidden() {
        return this.target.hidden
      }
    }

    const modal = new Modal(modalEl, formEl)
    if (opts.debug)
      window.modal = modal

    initUIListeners()

    /** Call Fuse and return results
     *  @param {string} input - value from input box
     *  @return {array} - results or string signal
     */
    function parseResults(input) {
      /*
       * Fuse returns an array of objects where each item is a document matched.
       * Each item has an array of matches which are also objects.
       * Those contain the 'indices' (start, end), the key matched and it's value.
       */

      const queryTemplate = (() => { 
        switch(opts.matchStrategy) {
          case "fuzzy":
            return input

          case "exact":
            return `\'"${input}"`
        }
      })()  // assign return of anonymous function to var
      
      let results

      if (input.length > opts.minInputLength) {
        results = fuse.search(queryTemplate)

        if (results.length > 0)
          results =  results.slice(0, opts.maxResults)
        else
          results = "No results found."

      } else {
        results = "Type more to search."
      }

      return results 
    }

    /** Build and inject a HTML bucket with the parsed results
     *  @param {string} input - value from input box
     *  @param {array|string} results or string signal
     */
    function parseHTML(input, results) {
      let bucket = ""

      if (typeof(results) === 'string') {
        bucket = `<li class="warning">${results}</li>`

      } else {
        results.forEach((raw, index) => {
          const result = {
            title: raw.item.title ? raw.item.title : null,
            description: raw.item.description ? raw.item.description : null,
            id: raw.item.id ? raw.item.id : null,
            url: raw.item.url ? raw.item.url : null,
            image: raw.item.image ? raw.item.image : null,
          }

          for (const alias of opts.aliases) {
            result[alias.output] = raw.item[alias.input]
          }

          if (opts.includeMatches)
            useMatches()

          /** Use matches indexes from Fuse.js and provide contextual results */
          function useMatches() {
            const contentMatch = getMatch(raw.matches, "content")

            /** Get the 1st match of a key
             *  @param {array} items - result matches generated by Fuse()
             *  @param {string} key - match type (e.g. "title")
             *  @return {object|null} - match or a no match signal 
             */
            function getMatch(items, key) {
              let match
              items.some((item) => {
                if (item.key === key ) {
                  match = item
                  return true
                }
              })
              return match
            }

            if (contentMatch)
              result.description = captureContext(contentMatch, 0)

            /** Capture context of a content match
             *  @param {object} match - match containing term match indices
             *  @param {int} index - index of the match on the matches array
             *  @return {string} - context extracted from match value
             */
            function captureContext(match, index) {
              let [first, last] = match.indices[index]
              const valueLength = match.value.length
              const captureLength = opts.maxContextLength - last + first

              first = first - captureLength / 2
              if (first < 0)
                first = 0

              last = last + captureLength / 2
              if (last > valueLength - 1)
                last = valueLength - 1

              return `...${match.value.slice(first, last)}...`
            }
          }

          /** Highlight matches w/ RegExp
           *  @param {string} text
           *  @param {object} re - regular expression literal 
           *  @return {string}
           */
          function hlMatch(text, re) {
              return text ? text.replace(re, '<mark>$&</mark>') : null

            /*
             * Could use the matches indexes to highlight but RegExp is doing the
             * job without problems and the change requires updating indexes when
             * capturing match context.
             */
          }

          const re = new RegExp(input, 'ig')  // i parameter to 'ignore' case sensitive
          
          result.title = result.title ? hlMatch(result.title, re) : 'Item missing title.'
          result.description = result.description ? hlMatch(result.description, re) : 'Item missing description.'

          // classify strings in title containing section 
          if (opts.showSectionOnTitle)
            result.title = result.title
              .replace(/(.*)\|(.*)/, '<span class="section">$1</span><span class="separator">|</span><span class="title">$2</span>')

          // build bucket
          bucket += `
            <li role="option" aria-selected="false">
              <a
                ${result.id ? `value="${result.id}"` : ''}
                href="${result.url}"
                tabindex="${index}"
              >
                ${result.image ? `<img src="${result.image}">` : '' }
                <div class="meta">
                  <p>${result.title}</p>
                  <p>${result.description}</p>
                </div>
              </a>
            </li>
          `
        })
      }
      
      modalEl.innerHTML = bucket
    }

    /** Init persistent user interaction listeners */
    function initUIListeners() { 
      inputEl.addEventListener("input",  instantSearch)
      inputEl.addEventListener("search", clearSearch)  // click 'x' to clear
      inputEl.addEventListener("click",  showModal)
      inputEl.addEventListener("keydown", inputKeyBinds)

      document.addEventListener("keydown", (event) => {
        if (event.key == "/") {  // global shortcut
          // do not trigger on inputs except search input
          if (event.srcElement.nodeName != "INPUT" || event.srcElement == inputEl) {
            event.preventDefault()
            toggleUI("global-shortcut")
          }
        }
      }, {passive: true})
    }

    /** Update search results as user types
     *  @param {object} event - keydown event 
     */
    function instantSearch(event) {
      const input = inputEl.value
      parseHTML(input, parseResults(input))
      if (modal.isHidden())
        showModal()
    }

    function showModal() {
      if (inputEl.value != "") {  // don't show modal before typing 
        modal.show()
        initModalListeners()
        
        if (opts.modalFullscreen)
          document.body.style.overflow = "hidden"  // prevent page scroll when modal is visible
      }
    }

    function hideModal() {
      modal.hide()
      removeModalListeners()
      
      if (opts.modalFullscreen)
        document.body.style.overflow = bodyOverflow 
    }

    function clearInput() {
      modalEl.innerHTML = "" 
      inputEl.value = ""
    }

    function clearSearch() {
      clearInput()
      hideModal()
    }

    /** Hide/show input and modal visibility only.
     *  @param {string} trigger - source of function call
     */
    function toggleUI(trigger) {
      let action = ""

      if (formEl.getAttribute("aria-expanded") == "true") {
        action = "hide"
        hideModal()

      } else {
        action = "show"
        inputEl.focus()

        if (inputEl.value != "") {
          showModal()
        }
      }

      if (opts.debug)
        console.log(`toggleUI(): {trigger: ${trigger}, action: ${action}}`)
    }

    function documentOnClick(event) {
      if (formEl.getAttribute("aria-expanded") == "true" && event.srcElement != inputEl)  // hide modal if it's open and click outside input
        toggleUI("document-click")
    }

    /** Init ephemeral user interaction listeners */
    function initModalListeners() {
      modalEl.addEventListener("keydown", modalKeyBinds)
      document.addEventListener("click", documentOnClick, {passive: true})
    }

    function removeModalListeners() {
      modalEl.removeEventListener("keydown", modalKeyBinds)
      document.removeEventListener("click", documentOnClick)
    }

    /**
     * @param {object} event - keydown event
     */
    function inputKeyBinds(event) {
      switch (event.key) {
        case "Escape":
          event.preventDefault()
          clearSearch()
          toggleUI("input-escape")
          break

        case "ArrowDown":
        case "Enter":
          event.preventDefault()
          scrollElement("first")
          formEl.blur()
          break
      }
    }

    /**
     *  @param {object} event - keydown event 
     */
    function modalKeyBinds(event) {
      event.preventDefault()
      const item = event.srcElement.parentElement

      switch (event.key) {
        case "Escape":
          clearSearch()
          inputEl.focus()
          break

        case "Backspace":
        case "Delete":
        case "a":
          scrollElement("input", item)
          break

        case "ArrowUp":
        case "w":
          scrollElement("up", item)
          break

        case "ArrowDown":
        case "s":
          scrollElement("down", item)
          break

        // TODO: Use local storage to preserve search state when opening item.
        case "Enter":
        case "d":
          const url = item.querySelector("a").href 
          if (url) 
            location.href = url 
      }
    }

    /**
     *  @param {string} direction 
     *  @param {object} [item] - DOM element 
     */
    function scrollElement(direction, item) {
      let target

      switch (direction) {
        case "first":
          target = modalEl.firstElementChild
          break

        case "up":
          if (item.previousElementSibling)
            target = item.previousElementSibling
          else
            scrollElement("input", item)
          break

        case "down":
          if (item.nextElementSibling)
            target = item.nextElementSibling
          break

        case "input":
          inputEl.focus()
          item.ariaSelected = false
      }
    
      if (target && target.querySelector("a")) {
        target.querySelector("a").focus()
        target.ariaSelected = true
        
        if (item)
          item.ariaSelected = false
      }
    }
  }
}

window.Search = Search
