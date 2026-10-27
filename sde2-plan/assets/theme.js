/* Applies the saved colour theme before first paint: light, dark, or (no key) follow the device.
   Settings > Appearance writes the key. */
(function () {
  var KEY = "sde2:v1:theme";
  var value = null;
  try { value = window.localStorage.getItem(KEY); } catch (e) { /* storage blocked: follow the device */ }
  if (value === "light" || value === "dark") document.documentElement.setAttribute("data-theme", value);
})();
