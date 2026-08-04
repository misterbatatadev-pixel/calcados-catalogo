const form = document.querySelector("#store-config-form");
const summary = document.querySelector("#config-summary");
const statusText = document.querySelector("#config-status");

const fields = {
  pixEnabled: document.querySelector("#pix-enabled"),
  pixKey: document.querySelector("#pix-key"),
  pixReceiver: document.querySelector("#pix-receiver"),
  pixInstructions: document.querySelector("#pix-instructions"),
  pickupEnabled: document.querySelector("#pickup-enabled"),
  pickupAddress: document.querySelector("#pickup-address"),
  pickupHours: document.querySelector("#pickup-hours"),
  pickupInstructions: document.querySelector("#pickup-instructions"),
  supportEnabled: document.querySelector("#support-enabled"),
  supportPhone: document.querySelector("#support-phone"),
  supportInstructions: document.querySelector("#support-instructions"),
  discountEnabled: document.querySelector("#discount-enabled"),
  discountType: document.querySelector("#discount-type"),
  discountFixed: document.querySelector("#discount-fixed"),
  discountPercent: document.querySelector("#discount-percent"),
  discountObjection: document.querySelector("#discount-objection"),
  discountInstructions: document.querySelector("#discount-instructions"),
  reservationEnabled: document.querySelector("#reservation-enabled"),
  reservationMinutes: document.querySelector("#reservation-minutes"),
  reservationInstructions: document.querySelector("#reservation-instructions"),
};

init();

async function init() {
  form.addEventListener("submit", saveConfig);
  await loadConfig();
}

async function loadConfig() {
  statusText.textContent = "";
  const response = await fetch("/store-config");
  if (!response.ok) {
    summary.textContent = "Nao foi possivel carregar as configuracoes.";
    return;
  }

  fillForm(await response.json());
  summary.textContent = "Regras comerciais usadas pelo catalogo e pelo robo.";
}

function fillForm(config) {
  fields.pixEnabled.checked = Boolean(config.pix?.enabled);
  fields.pixKey.value = config.pix?.key ?? "";
  fields.pixReceiver.value = config.pix?.receiverName ?? "";
  fields.pixInstructions.value = config.pix?.instructions ?? "";

  fields.pickupEnabled.checked = Boolean(config.pickup?.enabled);
  fields.pickupAddress.value = config.pickup?.address ?? "";
  fields.pickupHours.value = config.pickup?.hours ?? "";
  fields.pickupInstructions.value = config.pickup?.instructions ?? "";

  fields.supportEnabled.checked = Boolean(config.humanSupport?.enabled);
  fields.supportPhone.value = config.humanSupport?.phone ?? "";
  fields.supportInstructions.value = config.humanSupport?.instructions ?? "";

  fields.discountEnabled.checked = Boolean(config.discount?.enabled);
  fields.discountType.value = config.discount?.type ?? "fixed";
  fields.discountFixed.value = centsToReais(config.discount?.maxFixedCents ?? 0);
  fields.discountPercent.value = config.discount?.maxPercent ?? 0;
  fields.discountObjection.checked = Boolean(config.discount?.triggerOnlyOnObjection);
  fields.discountInstructions.value = config.discount?.instructions ?? "";

  fields.reservationEnabled.checked = Boolean(config.reservation?.enabled);
  fields.reservationMinutes.value = config.reservation?.durationMinutes ?? 60;
  fields.reservationInstructions.value = config.reservation?.instructions ?? "";
}

async function saveConfig(event) {
  event.preventDefault();
  statusText.textContent = "Salvando...";

  const response = await fetch("/store-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readForm()),
  });

  if (!response.ok) {
    statusText.textContent = "Erro ao salvar.";
    return;
  }

  fillForm(await response.json());
  statusText.textContent = "Configuracoes salvas.";
}

function readForm() {
  return {
    pix: {
      enabled: fields.pixEnabled.checked,
      key: fields.pixKey.value,
      receiverName: fields.pixReceiver.value,
      instructions: fields.pixInstructions.value,
    },
    pickup: {
      enabled: fields.pickupEnabled.checked,
      address: fields.pickupAddress.value,
      hours: fields.pickupHours.value,
      instructions: fields.pickupInstructions.value,
    },
    humanSupport: {
      enabled: fields.supportEnabled.checked,
      phone: fields.supportPhone.value,
      instructions: fields.supportInstructions.value,
    },
    discount: {
      enabled: fields.discountEnabled.checked,
      type: fields.discountType.value,
      maxFixedCents: reaisToCents(fields.discountFixed.value),
      maxPercent: Number(fields.discountPercent.value) || 0,
      triggerOnlyOnObjection: fields.discountObjection.checked,
      instructions: fields.discountInstructions.value,
    },
    reservation: {
      enabled: fields.reservationEnabled.checked,
      durationMinutes: Number(fields.reservationMinutes.value) || 60,
      instructions: fields.reservationInstructions.value,
    },
  };
}

function reaisToCents(value) {
  const normalized = String(value ?? "").replace(",", ".");
  return Math.round((Number(normalized) || 0) * 100);
}

function centsToReais(value) {
  return ((Number(value) || 0) / 100).toFixed(2);
}
