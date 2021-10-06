/**
 * @name     liteSearch
 * @desc     Light and agnostic search UI powered by Fuse.js
 * @author   Daniel Souza <me@posix.dev.br>
 * @version  2.1
 * @license  MIT
 */

// Fix for preserving doc header as Fuse.js does not follow JSDOC
// Issue: https://github.com/krisk/Fuse/issues/570

/*!
 * Fuse.js v6.4.6 - Lightweight fuzzy-search (http://fusejs.io)
 *
 * Copyright (c) 2021 Kiro Risk (http://kiro.me)
 * All Rights Reserved. Apache Software License 2.0
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

// TODO: Provide distrib script w/ Fuse.js bundled.
import Fuse from 'fuse/fuse.esm.js'
// <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.4.6" defer></script>

// TODO: Use window.searchOpts and use values bellow as fallback/example.
// Will free a lot of ternary operators that are used to assign default values.

(() => {
  const opts = {
    // Comment keys that aren't going to be used.
    keys: [
      { name: "title", weight: 7 },
      { name: "description", weight: 3 },
      { name: "content", weight: 1 },
    ],

    // Optionally provide an alias when key names on JSON differ from what the script expects.
    aliases: [
      { title: "name" }
    ],

    dataPath: "/index.json",
    // dataPath: "/" + basePath + lang + "/index.json",  // for multilingual 
    formSelector: "#search",
    minInputLength: 0,
    matchStrategy: "fuzzy",
    maxResults: 10,
    maxContextLength: 250,
    includeMatches: false,
    showSectionOnTitle: true,
    modalFullscreen: false,
  }

  // check: https://fusejs.io/api/options.html
  opts.fuse = {
    location: 0,
    distance: 0,
    ignoreLocation: true,
    ignoreFieldnorm: true,
    minMatchCharLength: 0,
    includeMatches: opts['includeMatches'],
    keys: opts['keys']
  }

  const matchStrategy = opts.matchStrategy ? opts.matchStrategy : "fuzzy"
  switch(matchStrategy) {
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

  let fuse = null
  fetchData()
    .then(data => {
      fuse = new Fuse(data, opts.fuse)
      window.addEventListener("load", initUI(), { passive: true })
    })
    .catch(console.error)

  /** Fetch data from a JSON endpoint
   *  @return {Object} - data for Fuse()
   */
  async function fetchData() {
    // eslint-disable-next-line
    const url = opts.dataPath ? opts.dataPath : "/index.json"
    const request = new Request(url, {method: 'GET', cache: 'default'})

    return fetch(request)
      .then(response => {
         if (!response.ok) {
           throw new Error("HTTP error " + response.status)
         }
         return response.json()
      })
  }

  // TODO: Move related procedures here.
  function initFuse() {
  }

  /** Initialize the user interface */
  function initUI() {
    const formSelector = opts.formSelector ? opts.formSelector : "#search"
    const formEl = document.querySelector(formSelector)
    const inputEl = formEl.querySelector("input")
    const modalEl = formEl.querySelector("ul")

    class Modal {
      constructor(element) {
        this.element = element
      }

      show() {
        if (this.element.hidden == true)
          this.element.hidden = false
          this.element.style.visibility = "visible"
      }

      hide() {
        if (this.element.hidden == false)
          this.element.hidden = true
          this.element.style.visibility = "hidden"
      }

      isHidden() {
        return this.element.hidden
      }
    }

    const modal = new Modal(modalEl)
    initUIListeners()

    /** Call Fuse and return results
     *  @param {string} input - value from input box
     *  @return {object} - results generated by Fuse()
     */
    function parseResults(input) {
      /*
       * Fuse returns an array of objects where each item is a document matched.
       * Each item has an array of matches which are also objects.
       * Those contain the 'indices' (start, end), the key matched and it's value.
       */

      const queryTemplate = (() => { 
        switch(matchStrategy) {
          case "fuzzy":
            return input

          case "exact":
            return `\'"${input}"`
        }
      })()  // assign return of anonymous function to var

      const minInputLength = opts.minInputLength ? opts.minInputLength : 0
      return (input.length > minInputLength) ? fuse.search(queryTemplate) : null
    }

    /** Build and inject a HTML bucket with the parsed results
     *  @param {string} input - value from input box
     *  @param {array|null} results or null signal
     */
    function parseHTML(input, results) {
      const maxResults = opts.maxResults ? opts.maxResults : 10

      let bucket = ""

      if (results === null) {
        bucket = `<li class="warning">Type more to search.</li>`

      } else if (results.length === 0) {
        bucket = `<li class="warning">No results found.</li>`

      } else if (results.length > 0) {
        results.slice(0, maxResults).forEach((raw, index) => {
          const result = {
            title: raw.item.title ? raw.item.title : null,
            description: raw.item.description ? raw.item.description : null,
            id: raw.item.id ? raw.item.id : null,
            url: raw.item.url ? raw.item.url : null,
            image: raw.item.image ? raw.item.image : null,
          }

          for (const [name, alias] of Object.entries(opts.aliases)) {
            result[name] = raw.item[alias]
          }

          if (opts.includeMatches)
            useMatches()

          /** Use matches indexes from Fuse.js and provide contextual results */
          // TODO: Refactor this and maybe move it to parse results.
          function useMatches() {
            // const titleMatch = getMatch(result.matches, "title")
            // const contentMatch = getMatch(result.matches, "content")
            // capture the context of the 1st content match (optional)
            // if (contentMatch != null) {
            //   content = captureContext(contentMatch, 0)

            // } else {
            //   content = result.item.description
            // }

            /** Get the 1st match of a key
             *  @param {array} items - result matches generated by Fuse()
             *  @param {string} key - match type (e.g. "title")
             *  @return {object|null} - match or a no match signal 
             */
            function getMatch(items, key) {
              let match = null
              items.some((item) => {
                if (item.key === key ) {
                  match = item
                  return true
                }
              })
              return match
            }

            /** Capture context of a match
             *  @param {object} match - match containing term match indices
             *  @param {int} index - index of the match on the matches array
             *  @return {string} - context extracted from match value
             */
            function captureContext(match, index) {
              let [first, last] = match.indices[index]  // capture the indexes of the first match
              const maxContextLength = opts.maxContextLength ? opts.maxContextLength : 250
              const valueLength = match.value.length
              const captureLength = maxContextLength - last + first

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
            return text
              .replace(re, '<mark>$&</mark>')

            /*
             * Could use the matches indexes to highlight but RegExp is doing the
             * job without problems and the change requires updating indexes when
             * capturing match context.
             */
          }

          const re = new RegExp(input, 'ig')  // i parameter to 'ignore' case sensitive
          
          result.title = hlMatch(result.title, re)
          result.description = hlMatch(result.description, re)
          
          // classify strings in title containing section 
          if (opts.showSectionOnTitle)
            result.title = result.title
              .replace(/(.*)\|(.*)/, '<span class="section">$1</span><span class="separator">|</span><span class="title">$2</span>')

          // 3. Build bucket
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

      document.addEventListener("click", (event) => {
        if (event.path[0] != inputEl) {  // toggle UI if click outside input
          toggleUI()
        }
      }, {passive: true})

      document.addEventListener("keydown", (event) => {
        if (event.key == "/") {  // global shortcut
          // do not trigger on inputs except search input
          if (event.srcElement.nodeName != "INPUT" || event.path[0] == inputEl) {
            event.preventDefault()
            toggleUI()
          }
        }
      })
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

    // TODO: Extend 'Modal' class to reduce spaghetti code.

    function showModal() {
      if (inputEl.value != "") {  // don't open modal before typing 
        modal.show()
        initModalListeners()
        if (opts.modalFullscreen)
          document.body.style.overflow = "hidden"  // prevent page scroll when modal is open
      }
    }

    function closeModal() {
      modal.hide()
      removeModalListeners()
      document.body.style.overflow = "unset"
    }

    function clearInput() {
      modalEl.innerHTML = "" 
      inputEl.value = ""
    }

    function clearSearch() {
      clearInput()
      closeModal()
    }

    /** Hide/show input and modal visibility only. */
    function toggleUI() {
      // TODO: should use formEl instead?
      if (inputEl.ariaExpanded) {
        closeModal()
        inputEl.ariaExpanded = false

      } else {
        inputEl.focus()

        if (inputEl.value != "") {
          showModal()
          inputEl.ariaExpanded = true
        }
      }
    }

    /** Init ephemeral user interaction listeners */
    function initModalListeners() {
      modalEl.addEventListener("keydown", modalKeyBinds)
    }

    function removeModalListeners() {
      modalEl.removeEventListener("keydown", modalKeyBinds)
    }

    /**
     * @param {object} event - keydown event
     */
    function inputKeyBinds(event) {
      switch (event.key) {
        case "Escape":
          event.preventDefault()
          clearSearch()
          toggleUI()
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
      const item = event.path[1]

      switch (event.key) {
        case "Escape":
          clearSearch()
          inputEl.focus()
          break

        case "Backspace":
        case "Delete":
          scrollElement("input", item)
          break

        case "ArrowUp":
          scrollElement("up", item)
          break

        case "ArrowDown":
          scrollElement("down", item)
          break

        // TODO: Use local storage to preserve search state when opening item.
        case "Enter":
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
      let target = null

      switch (direction) {
        case "first":
          target = modalEl.firstElementChild
          break

        case "up":
          if (item.previousElementSibling) {
            target = item.previousElementSibling
          } else {
            scrollElement("input", item)
          }
          break

        case "down":
          if (item.nextElementSibling)
            target = item.nextElementSibling
          break

        case "input":
          inputEl.focus()
          item.ariaSelected = false
      }
     
      if (target != null) {
        target.querySelector("a").focus()
        target.ariaSelected = true
        
        if (item)
          item.ariaSelected = false
      }
    }
  }
})()
