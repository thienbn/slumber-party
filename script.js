(function () {
  "use strict";

  const SELECTORS = {
    body: "body",
    skipLink: ".skip-link",
    openingButton: ".opening__button",
    shell: "#site-shell",
    invitation: "#invitation",
    dateForm: "#date-poll-form",
    dateMessage: "#date-poll-message",
    wishForm: "#wish-form",
    wishMessage: "#wish-message",
    wishWall: "#wish-wall",
  };

  const STORAGE_KEYS = {
    revealed: "slumberParty.revealed",
    dateVotes: "slumberParty.dateVotes",
    wishes: "slumberParty.wishes",
  };

  const COPY = {
    dateEmpty: "choose at least one possible night, unless you are voting from another dimension.",
    dateNameEmpty: "leave a name, nickname, or mysterious initials so i know who voted.",
    dateSuccess: "your vote has been saved. thank you.",
    networkError: "the internet moth dropped your note. please try once more.",
    wishEmpty: "the post-it waited very patiently, but received no wish.",
    wishSuccess: "your note is on the wall now. thank you for improving the future.",
    idleSecret: "the page is happy you stayed.",
  };

  const storage = createStorageAdapter();

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const elements = getElements();

    initReveal(elements);
    initDatePoll(elements);
    initWishForm(elements);
    initPlaceholderRotation(elements.wishForm);
  }

  function getElements() {
    return {
      body: document.querySelector(SELECTORS.body),
      skipLink: document.querySelector(SELECTORS.skipLink),
      openingButton: document.querySelector(SELECTORS.openingButton),
      shell: document.querySelector(SELECTORS.shell),
      invitation: document.querySelector(SELECTORS.invitation),
      dateForm: document.querySelector(SELECTORS.dateForm),
      dateMessage: document.querySelector(SELECTORS.dateMessage),
      wishForm: document.querySelector(SELECTORS.wishForm),
      wishMessage: document.querySelector(SELECTORS.wishMessage),
      wishWall: document.querySelector(SELECTORS.wishWall),
    };
  }

  function initReveal({ body, skipLink, openingButton, shell, invitation }) {
    if (!openingButton || !shell) {
      return;
    }

    let idleTimer = null;

    const reveal = ({ shouldScroll = true } = {}) => {
      body.classList.add("is-revealed");
      shell.dataset.revealed = "true";
      openingButton.setAttribute("aria-expanded", "true");
      storage.set(STORAGE_KEYS.revealed, true);

      if (shouldScroll && invitation) {
        invitation.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        appendIdleSecret(shell);
      }, 9000);
    };

    if (storage.get(STORAGE_KEYS.revealed, false)) {
      reveal({ shouldScroll: false });
    }

    openingButton.addEventListener("click", () => reveal());

    if (skipLink) {
      skipLink.addEventListener("click", () => reveal({ shouldScroll: false }));
    }
  }

  function appendIdleSecret(shell) {
    if (document.querySelector("[data-idle-secret]")) {
      return;
    }

    const secret = document.createElement("p");
    secret.className = "form-message";
    secret.dataset.idleSecret = "true";
    secret.textContent = COPY.idleSecret;
    shell.prepend(secret);
  }

  function initDatePoll({ dateForm, dateMessage }) {
    if (!dateForm || !dateMessage) {
      return;
    }

    dateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage(dateMessage);

      const formData = new FormData(dateForm);
      const dates = formData.getAll("dates").map(String);
      const name = String(formData.get("name") || "").trim();
      const message = String(formData.get("message") || "").trim();

      if (dates.length === 0) {
        setMessage(dateMessage, COPY.dateEmpty, "error");
        return;
      }

      if (!name) {
        setMessage(dateMessage, COPY.dateNameEmpty, "error");
        dateForm.elements.name.focus();
        return;
      }

      const vote = {
        id: createId(),
        name,
        dates,
        message,
        createdAt: new Date().toISOString(),
      };

      await submitWithFeedback({
        form: dateForm,
        messageElement: dateMessage,
        endpoint: dateForm.dataset.endpoint,
        payload: vote,
        storageKey: STORAGE_KEYS.dateVotes,
        successMessage: COPY.dateSuccess,
        onSuccess: () => {
          dateForm.reset();
        },
      });
    });
  }

  function initWishForm({ wishForm, wishMessage, wishWall }) {
    if (!wishForm || !wishMessage || !wishWall) {
      return;
    }

    renderStoredWishes(wishWall);

    wishForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessage(wishMessage);

      const formData = new FormData(wishForm);
      const activity = String(formData.get("activity") || "").trim();
      const name = String(formData.get("name") || "").trim();

      if (!activity) {
        setMessage(wishMessage, COPY.wishEmpty, "error");
        wishForm.elements.activity.focus();
        return;
      }

      const wish = {
        id: createId(),
        activity,
        name,
        createdAt: new Date().toISOString(),
      };

      await submitWithFeedback({
        form: wishForm,
        messageElement: wishMessage,
        endpoint: wishForm.dataset.endpoint,
        payload: wish,
        storageKey: STORAGE_KEYS.wishes,
        successMessage: COPY.wishSuccess,
        onSuccess: () => {
          storage.append(STORAGE_KEYS.wishes, wish);
          appendWish(wishWall, wish, { isNew: true });
          wishForm.reset();
        },
        shouldStoreLocally: false,
      });
    });
  }

  function initPlaceholderRotation(wishForm) {
    if (!wishForm || !wishForm.elements.activity) {
      return;
    }

    const input = wishForm.elements.activity;
    let index = 0;

    window.setInterval(() => {
      if (document.activeElement === input || input.value) {
        return;
      }

      index = (index + 1) % WISH_PLACEHOLDERS.length;
      input.placeholder = WISH_PLACEHOLDERS[index];
    }, 4200);
  }

  async function submitWithFeedback({
    form,
    messageElement,
    endpoint,
    payload,
    storageKey,
    successMessage,
    onSuccess,
    shouldStoreLocally = true,
  }) {
    setFormDisabled(form, true);

    try {
      if (endpoint) {
        await postJson(endpoint, payload);
      }

      if (shouldStoreLocally) {
        storage.append(storageKey, payload);
      }

      onSuccess();
      setMessage(messageElement, successMessage);
    } catch (error) {
      setMessage(messageElement, COPY.networkError, "error");
    } finally {
      setFormDisabled(form, false);
    }
  }

  async function postJson(endpoint, payload) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
  }

  function renderStoredWishes(wishWall) {
    const wishes = storage.get(STORAGE_KEYS.wishes, []);

    wishes.forEach((wish) => {
      appendWish(wishWall, wish);
    });
  }

  function appendWish(wishWall, wish, { isNew = false } = {}) {
    const item = document.createElement("li");
    item.className = "post-it";
    item.textContent = wish.activity;

    if (wish.name) {
      item.title = `wished by ${wish.name}`;
    } else {
      item.title = "somebody wished this";
    }

    if (isNew) {
      item.dataset.new = "true";
    }

    wishWall.append(item);
  }

  function setMessage(element, text, tone = "success") {
    element.textContent = text;
    element.dataset.tone = tone;
  }

  function clearMessage(element) {
    element.textContent = "";
    delete element.dataset.tone;
  }

  function setFormDisabled(form, isDisabled) {
    Array.from(form.elements).forEach((element) => {
      element.disabled = isDisabled;
    });
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function createStorageAdapter() {
    const memoryFallback = new Map();

    return {
      get(key, fallback) {
        try {
          const rawValue = window.localStorage.getItem(key);
          return rawValue === null ? fallback : JSON.parse(rawValue);
        } catch (error) {
          if (!memoryFallback.has(key)) {
            return fallback;
          }

          return memoryFallback.get(key);
        }
      },
      set(key, value) {
        try {
          window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
          memoryFallback.set(key, value);
        }
      },
      append(key, value) {
        const values = this.get(key, []);
        values.push(value);
        this.set(key, values);
      },
    };
  }
})();