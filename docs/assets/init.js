(function () {
  "use strict";
  try {
    var theme = window.localStorage.getItem("cloudless-theme");
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", theme);

    var lang = window.localStorage.getItem("cloudless-lang") || "en";
    document.documentElement.setAttribute("data-lang", lang);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.setAttribute("data-lang", "en");
  }
})();
