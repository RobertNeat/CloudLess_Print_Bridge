(function () {
  "use strict";

  function currentPageFile() {
    var path = window.location.pathname;
    return path.substring(path.lastIndexOf("/") + 1) || "index.html";
  }

  function basePrefix() {
    // Pages under /pages/ need ../ to reach assets/ and media/ at site root.
    return window.location.pathname.indexOf("/pages/") !== -1 ? "../" : "";
  }

  function buildSidebar() {
    var nav = window.CLOUDLESS_NAV || [];
    var lang = document.documentElement.getAttribute("data-lang") || "en";
    var here = currentPageFile();
    var prefix = basePrefix();
    var root = document.createElement("ul");

    nav.forEach(function (entry) {
      var li = document.createElement("li");
      li.className = "nav-section";

      var href = entry.href.indexOf("pages/") === 0 ? prefix + entry.href : prefix + entry.href;
      var entryFile = entry.href.substring(entry.href.lastIndexOf("/") + 1);
      if (entryFile === here) {
        li.className += " active";
      }

      var a = document.createElement("a");
      a.href = href;
      a.textContent = entry.label[lang] || entry.label.en;
      li.appendChild(a);

      if (entry.sections && entry.sections.length) {
        var sub = document.createElement("ul");
        sub.className = "nav-subsection";
        entry.sections.forEach(function (section) {
          var sLi = document.createElement("li");
          var sA = document.createElement("a");
          sA.href = href + "#" + section.id;
          sA.textContent = section.label[lang] || section.label.en;
          sLi.appendChild(sA);
          sub.appendChild(sLi);
        });
        li.appendChild(sub);
      }

      root.appendChild(li);
    });

    var mount = document.getElementById("sidebar-nav");
    if (mount) {
      mount.innerHTML = "";
      mount.appendChild(root);
    }
  }

  function setLang(lang) {
    document.documentElement.setAttribute("data-lang", lang);
    try {
      window.localStorage.setItem("cloudless-lang", lang);
    } catch (e) {}
    var enBtn = document.getElementById("lang-en");
    var plBtn = document.getElementById("lang-pl");
    if (enBtn) enBtn.setAttribute("aria-pressed", String(lang === "en"));
    if (plBtn) plBtn.setAttribute("aria-pressed", String(lang === "pl"));
    buildSidebar();
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem("cloudless-theme", theme);
    } catch (e) {}
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", String(theme === "dark"));
      btn.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
    }
  }

  function toggleSidebar() {
    var shell = document.querySelector(".shell");
    if (shell) shell.classList.toggle("sidebar-open");
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildSidebar();

    var enBtn = document.getElementById("lang-en");
    var plBtn = document.getElementById("lang-pl");
    if (enBtn) enBtn.addEventListener("click", function () { setLang("en"); });
    if (plBtn) plBtn.addEventListener("click", function () { setLang("pl"); });

    var themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        setTheme(next);
      });
      var theme = document.documentElement.getAttribute("data-theme") || "light";
      setTheme(theme);
    }

    var lang = document.documentElement.getAttribute("data-lang") || "en";
    var enBtn2 = document.getElementById("lang-en");
    var plBtn2 = document.getElementById("lang-pl");
    if (enBtn2) enBtn2.setAttribute("aria-pressed", String(lang === "en"));
    if (plBtn2) plBtn2.setAttribute("aria-pressed", String(lang === "pl"));

    var menuBtn = document.getElementById("menu-toggle");
    if (menuBtn) menuBtn.addEventListener("click", toggleSidebar);
  });
})();
