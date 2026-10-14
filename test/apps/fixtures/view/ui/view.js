// A minimal installable submodel view for the app tests: it connects with
// the bare protocol (no SDK, no build) and shows the submodel it was given.
window.addEventListener('message', event => {
  if (event.source === parent && event.data?.type === 'connect' && event.ports[0]) {
    event.ports[0].start()
    document.querySelector('#submodel').textContent = event.data.context.submodel?.id ?? 'no submodel'
  }
})
parent.postMessage({ protocol: 'studio-sdk/0', type: 'hello' }, '*')
