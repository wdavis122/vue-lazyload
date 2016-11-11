const inBrowser = typeof window !== 'undefined'

if (!Array.prototype.$remove) {
    Array.prototype.$remove = function (item) {
        if (!this.length) return
        const index = this.indexOf(item)
        if (index > -1) {
          return this.splice(index, 1)
        }
    }
}

export default (Vue, Options = {}) => {
    const isVueNext = Vue.version.split('.')[0] === '2'
    const DEFAULT_URL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA='
    const ListenEvents = ['scroll', 'wheel', 'mousewheel', 'resize', 'animationend', 'transitionend']

    const Init = {
        preLoad: Options.preLoad || 1.3,
        error: Options.error || DEFAULT_URL,
        loading: Options.loading || DEFAULT_URL,
        attempt: Options.attempt || 3,
        scale: Options.scale || inBrowser ? window.devicePixelRatio : 1,
        hasbind: false,
    }

    const Listeners = []
    const imageCache = []

    const throttle = function (action, delay) {
        let timeout = null
        let lastRun = 0
        return function () {
            if (timeout) {
                return
            }
            let elapsed = Date.now() - lastRun
            let context = this
            let args = arguments
            let runCallback = function () {
                    lastRun = Date.now()
                    timeout = false
                    action.apply(context, args)
                }
            if (elapsed >= delay) {
                runCallback()
            }
            else {
                timeout = setTimeout(runCallback, delay)
            }
        }
    }

    const _ = {
        on (el, type, func) {
            el.addEventListener(type, func)
        },
        off (el, type, func) {
            el.removeEventListener(type, func)
        }
    }

    const lazyLoadHandler = throttle(() => {
        for (let i = 0, len = Listeners.length; i < len; ++i) {
            checkCanShow(Listeners[i])
        }
    }, 300)

    const onListen = (el, start) => {
        if (start) {
            ListenEvents.forEach((evt) => {
                _.on(el, evt, lazyLoadHandler)
            })
        } else {
            Init.hasbind = false
            ListenEvents.forEach((evt) => {
                _.off(el, evt, lazyLoadHandler)
            })
        }
    }

    const checkCanShow = (listener) => {
        if (imageCache.indexOf(listener.src) > -1) return setElRender(listener.el, listener.bindType, listener.src, 'loaded')
        let rect = listener.el.getBoundingClientRect()

        if ((rect.top < window.innerHeight * Init.preLoad && rect.bottom > 0) && (rect.left < window.innerWidth * Init.preLoad && rect.right > 0)) {
            render(listener)
        }
    }

    const setElRender = (el, bindType, src, state) => {
        if (!bindType) {
            el.setAttribute('src', src)
        } else {
            el.setAttribute('style', bindType + ': url(' + src + ')')
        }
        el.setAttribute('lazy', state)
    }


    const render = (item) => {
        if (item.attempt >= Init.attempt) return false

        item.attempt++

        loadImageAsync(item, (image) => {
                setElRender(item.el, item.bindType, item.src, 'loaded')
                imageCache.push(item.src)
                Listeners.$remove(item)
            }, (error) => {
                setElRender(item.el, item.bindType, item.error, 'error')
            })
    }

    const loadImageAsync = (item, resolve, reject) => {
        let image = new Image()
        image.src = item.src

        image.onload = function () {
            resolve({
                naturalHeight: image.naturalHeight,
                naturalWidth: image.naturalWidth,
                src: item.src
            })
        }

        image.onerror = function (e) {
            reject(e)
        }
    }

    const componentWillUnmount = (el, binding, vnode, OldVnode) => {
        if (!el) return

        for (let i = 0, len = Listeners.length; i < len; i++) {
            if (Listeners[i] && Listeners[i].el === el) {
                Listeners.splice(i, 1)
            }
        }

        if (Init.hasbind && Listeners.length == 0) {
            onListen(window, false)
        }
    }

    const checkElExist = (el) => {
        let hasIt = false

        Listeners.forEach((item) => {
            if (item.el === el) hasIt = true
        })

        if (hasIt) {
            return Vue.nextTick(() => {
                lazyLoadHandler()
            })
        }
        return hasIt
    }

    const addListener = (el, binding, vnode) => {
        if (el.getAttribute('lazy') === 'loaded') return
        if (checkElExist(el)) return

        let parentEl = null
        let imageSrc = binding.value
        let imageLoading = Init.loading
        let imageError = Init.error

        if (typeof(binding.value) !== 'string' && binding.value) {
            imageSrc = binding.value.src
            imageLoading = binding.value.loading || Init.loading
            imageError = binding.value.error || Init.error
        }

        if (imageCache.indexOf(imageSrc) > -1) return setElRender(el, binding.arg, imageSrc, 'loaded')

        setElRender(el, binding.arg, imageLoading, 'loading')

        Vue.nextTick(() => {
            if (binding.modifiers) {
                parentEl = window.document.getElementById(Object.keys(binding.modifiers)[0])
            }

            Listeners.push({
                bindType: binding.arg,
                attempt: 0,
                parentEl: parentEl,
                el: el,
                error: imageError,
                src: imageSrc
            })
            lazyLoadHandler()

            if (Listeners.length > 0 && !Init.hasbind) {
                Init.hasbind = true
                onListen(window, true)

                if (parentEl) {
                    onListen(parentEl, true)
                }
            }
        })
    }

    if (isVueNext) {
        Vue.directive('lazy', {
            bind: addListener,
            update: addListener,
            inserted: addListener,
            componentUpdated: lazyLoadHandler,
            unbind : componentWillUnmount
        })
    } else {
        Vue.directive('lazy', {
            bind: lazyLoadHandler,
            update (newValue, oldValue) {
                addListener(this.el, {
                    modifiers: this.modifiers,
                    arg: this.arg,
                    value: newValue,
                    oldValue: oldValue
                })
            },
            unbind () {
                componentWillUnmount(this.el)
            }
        })
    }
}
