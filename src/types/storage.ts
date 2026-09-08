export enum StorageKeys {
  GlobalStore = "dockosha-global-store",
  /**
   * Layout preference only (folder pane expanded/collapsed). This is UI chrome
   * state, never viewer identity or analytics tracking.
   */
  DocumentsFolderPane = "dockosha-documents-folder-pane",
}

export enum CookieKeys {
  ContactFormSubmitted = "contact-form-submitted",
  DataRequestSubmitted = "data-request-submitted",
}
