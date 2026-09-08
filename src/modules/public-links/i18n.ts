import {
  DEFAULT_PUBLIC_LANGUAGE,
  type PublicLanguage,
} from "@/modules/public-links/types";

type PublicMessages = {
  metadata: {
    documentViewerTitle: string;
    documentViewerDescription: string;
    dataRoomViewerTitle: string;
    dataRoomViewerDescription: string;
    secureViewerLinkTitle: string;
    secureViewerLinkDescription: string;
  };
  header: {
    sharedViaDocKosha: string;
    feedback: string;
    giveFeedback: string;
    feedbackPlaceholder: string;
    submitFeedback: string;
    comments: string;
    hideComments: string;
    showComments: string;
    qAndA: string;
    frequentlyAskedQuestions: string;
    download: string;
    verifiedWorkspace: string;
    backToDataRoom: string;
    poweredByDocKosha: string;
  };
  common: {
    emailRequired: string;
    validEmailRequired: string;
    enterVerificationCode: string;
    failedToSendCode: string;
    verificationFailed: string;
    unableToVerifyNdaStatus: string;
    unableToOpenLink: string;
    incorrectPassword: string;
    passwordRequired: string;
    linkUnavailable: string;
    tryAgain: string;
    tryDifferentAccount: string;
    sending: string;
    sendCode: string;
    resendCode: string;
    resendIn: (seconds: number) => string;
    changeEmail: string;
    verify: string;
    verifying: string;
    checking: string;
    continue: string;
    change: string;
    loadingDataRoom: string;
    didntGetCode: string;
    contactLinkOwner: string;
    contactSenderForHelp: string;
    close: string;
    cancel: string;
  };
  document: {
    emailVerificationRequired: string;
    verifyEmailToAccess: (
      resourceActionVerb: string,
      resourcePlainName: string,
    ) => string;
    passwordProtectedLink: string;
    protectedDescription: (
      resourceActionVerb: string,
      resourcePlainName: string,
    ) => string;
    unlock: string;
    enterEmailPlaceholder: string;
    enterCodePlaceholder: string;
    enterPasswordPlaceholder: string;
    verifyEmailToCommentTitle: string;
    verifyEmailToCommentDescription: string;
    sendCommentCode: string;
    commentEmailPlaceholder: string;
    commentCodePlaceholder: string;
    documentResolveError: (code: string) => string;
    sharedDocumentFallback: string;
    unableToDownload: string;
    unableToPrint: string;
    allowPopupsToPrint: string;
    commentActionFailed: string;
    commentSelectionFailed: string;
  };
  dataRoom: {
    protectedTitle: string;
    protectedDescription: string;
    unlock: string;
    emailVerificationRequired: string;
    verifyEmailDescription: string;
    dataRoomResolveError: (code: string) => string;
    browseFolders: string;
    browseSharedContent: string;
    viewingFolderContents: string;
    downloadEntireDataRoomZip: string;
    downloadThisFolderZip: string;
    noFolderSelectedForDownload: string;
    unableToDownloadZip: string;
    foldersTitle: string;
    noDocumentsYet: string;
    emptyFolder: string;
    name: string;
    size: string;
    actions: string;
    empty: string;
    fileCount: (count: number) => string;
    open: string;
    allDocuments: string;
    untitledFolder: string;
    untitledDocument: string;
  };
  comments: {
    addComment: string;
    threadTitle: string;
    commentPlaceholder: string;
    replyPlaceholder: string;
    submitComment: string;
    sendReply: string;
    loadingThread: string;
    unableToLoadThread: string;
    closeComments: string;
    resolve: string;
    reopen: string;
    resolved: string;
    viewThread: string;
    hideThread: string;
    deleteComment: string;
    deleted: string;
    resolvedDescription: string;
    openCommentThread: string;
    you: string;
    viewer: string;
  };
  nda: {
    processingTitle: string;
    processingMessage: string;
    retrying: string;
    signAgain: string;
    introTitle: string;
    verifyEmailTitle: string;
    verifyEmailDescription: string;
    sendVerificationCode: string;
    signTitle: string;
    signDescription: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    verificationCodePlaceholder: string;
    emailVerified: string;
    agreementBetween: (
      workspaceName: string,
      fullName: string,
      resourcePlainName: string,
    ) => string;
    templateUnavailable: string;
    agreementPreview: string;
    reviewBeforeSigning: string;
    drawSignature: string;
    typeSignature: string;
    selected: string;
    drawSignatureHelp: string;
    clearSignature: string;
    typeSignaturePlaceholder: string;
    acceptAndSign: string;
    signing: string;
    enterFullName: string;
    provideSignature: string;
    failedToSign: string;
    introDescription: (
      workspaceName: string | null,
      resourceActionVerb: string,
      resourceQuotedName: string,
      resourcePlainName: string,
    ) => string;
  };
  emails: {
    linkOtpSubject: string;
    linkOtpTitle: string;
    linkOtpPreheader: string;
    linkOtpIntro: string;
    linkOtpExpiry: (minutes: number) => string;
    linkInviteSubjectDocument: (resourceName: string) => string;
    linkInviteSubjectDataRoom: (resourceName: string) => string;
    linkInviteTitleDocument: string;
    linkInviteTitleDataRoom: string;
    linkInvitePreheader: (resourceName: string) => string;
    linkInviteIntroDocument: (resourceName: string) => string;
    linkInviteIntroDataRoom: (resourceName: string) => string;
    linkInviteOpenLink: string;
    linkInviteExpiry: (dateLabel: string) => string;
    ndaSignedViewerSubject: (resourceTitle: string) => string;
    ndaSignedViewerTitle: string;
    ndaSignedViewerPreheader: (workspaceName: string) => string;
    ndaSignedViewerBody: (
      contextLabel: string,
      resourceTitle: string,
    ) => string;
    ndaSignedViewerAttachment: string;
    commentReplySubject: (documentTitle: string) => string;
    commentReplyTitle: string;
    commentReplyPreheader: string;
    commentReplyBody: (
      replyAuthorEmail: string,
      documentTitle: string,
    ) => string;
    commentReplyLine: (replyBody: string) => string;
    commentReplyOpenDocument: string;
  };
};

const dictionaries: Record<PublicLanguage, PublicMessages> = {
  en: {
    metadata: {
      documentViewerTitle: "Document Viewer",
      documentViewerDescription: "Secure public document viewer",
      dataRoomViewerTitle: "Data Room Viewer",
      dataRoomViewerDescription: "Secure public data room viewer",
      secureViewerLinkTitle: "Secure Viewer Link",
      secureViewerLinkDescription: "Secure public viewer link",
    },
    header: {
      sharedViaDocKosha: "Shared via DocKosha",
      feedback: "Feedback",
      giveFeedback: "Give Feedback",
      feedbackPlaceholder: "Share your thoughts...",
      submitFeedback: "Submit Feedback",
      comments: "Comments",
      hideComments: "Hide comments",
      showComments: "Show comments",
      qAndA: "Q&A",
      frequentlyAskedQuestions: "Frequently Asked Questions",
      download: "Download",
      verifiedWorkspace: "Verified workspace",
      backToDataRoom: "Back to data room",
      poweredByDocKosha: "Powered by DocKosha",
    },
    common: {
      emailRequired: "Email is required.",
      validEmailRequired: "Enter a valid email address.",
      enterVerificationCode: "Enter the verification code",
      failedToSendCode: "Failed to send code",
      verificationFailed: "Verification failed",
      unableToVerifyNdaStatus: "Unable to verify NDA status",
      unableToOpenLink: "Unable to open link",
      incorrectPassword: "Incorrect password. Please try again.",
      passwordRequired: "Password is required.",
      linkUnavailable: "Link Unavailable",
      tryAgain: "Try again",
      tryDifferentAccount: "Try with a different account",
      sending: "Sending…",
      sendCode: "Send Code",
      resendCode: "Resend code",
      resendIn: (seconds) => `Resend in ${seconds}s`,
      changeEmail: "Change email",
      verify: "Verify",
      verifying: "Verifying…",
      checking: "Checking…",
      continue: "Continue",
      change: "Change",
      loadingDataRoom: "Loading data room…",
      didntGetCode: "Didn't get the code?",
      contactLinkOwner:
        "If you believe this is a mistake, contact the person who shared the link with you.",
      contactSenderForHelp:
        "If you believe this is a mistake, contact the sender for help.",
      close: "Close",
      cancel: "Cancel",
    },
    document: {
      emailVerificationRequired: "Email Verification Required",
      verifyEmailToAccess: (resourceActionVerb, resourcePlainName) =>
        `Verify your email to ${resourceActionVerb} ${resourcePlainName}.`,
      passwordProtectedLink: "Password Protected Link",
      protectedDescription: (resourceActionVerb, resourcePlainName) =>
        `Enter the password to ${resourceActionVerb} ${resourcePlainName}.`,
      unlock: "Unlock",
      enterEmailPlaceholder: "Enter your email…",
      enterCodePlaceholder: "Enter 6-digit code…",
      enterPasswordPlaceholder: "Enter password…",
      verifyEmailToCommentTitle: "Verify Email to Comment",
      verifyEmailToCommentDescription:
        "Verify your email to create a comment on this document.",
      sendCommentCode: "Send Code",
      commentEmailPlaceholder: "Enter your email…",
      commentCodePlaceholder: "Enter 6-digit code…",
      documentResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "This document link is invalid or has been revoked.";
          case "EXPIRED":
            return "This document link has expired.";
          case "REVOKED":
            return "The workspace owner has revoked this link.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "This document can only be opened from a verified workspace domain.";
          case "EMAIL_OTP_REQUIRED":
            return "This link requires email verification. Please reload and verify your email to continue.";
          case "ALC_NOT_ALLOWED":
            return "You don’t have permission to access this document.";
          case "NDA_SIGN_REQUIRED":
            return "You must sign the NDA before viewing this document.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "This workspace has reached its viewing limit for the month.";
          default:
            return "We were unable to open this document. The link may be unavailable.";
        }
      },
      sharedDocumentFallback: "Shared document",
      unableToDownload:
        "Unable to download the document right now. Please try again.",
      unableToPrint:
        "Unable to print the document right now. Please try again.",
      allowPopupsToPrint: "Please allow popups to print this document.",
      commentActionFailed: "Unable to complete comment action",
      commentSelectionFailed:
        "Couldn't start a comment from this selection. Please reselect the text and try again.",
    },
    dataRoom: {
      protectedTitle: "Protected Data Room",
      protectedDescription:
        "Enter the password provided by the data room owner to continue.",
      unlock: "Unlock Data Room",
      emailVerificationRequired: "Email Verification Required",
      verifyEmailDescription: "Verify your email to access this data room.",
      dataRoomResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "This data room link is invalid or has been revoked.";
          case "EXPIRED":
            return "This data room link has expired.";
          case "REVOKED":
            return "The workspace owner has revoked this link.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "This link can only be opened from the verified workspace domain.";
          case "EMAIL_OTP_REQUIRED":
            return "This link requires email verification. Please reload and verify your email to continue.";
          case "ALC_NOT_ALLOWED":
            return "You don’t have permission to access this data room.";
          case "NDA_SIGN_REQUIRED":
            return "You must sign the NDA before viewing this data room.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "This link has hit its viewing limit. Please contact the sender for access.";
          default:
            return "We were unable to open this data room. The link may be unavailable.";
        }
      },
      browseFolders: "Browse folders",
      browseSharedContent:
        "Browse the shared folders and documents in this data room.",
      viewingFolderContents: "Viewing the contents of this folder.",
      downloadEntireDataRoomZip: "Download entire data room (.zip)",
      downloadThisFolderZip: "Download this folder (.zip)",
      noFolderSelectedForDownload: "No folder selected for download.",
      unableToDownloadZip:
        "Unable to download ZIP right now. Please try again.",
      foldersTitle: "Folders",
      noDocumentsYet: "There are no documents in this data room yet.",
      emptyFolder: "This folder is empty.",
      name: "Name",
      size: "Size",
      actions: "Actions",
      empty: "Empty",
      fileCount: (count) => `${count} file${count === 1 ? "" : "s"}`,
      open: "View",
      allDocuments: "All documents",
      untitledFolder: "Untitled folder",
      untitledDocument: "Untitled document",
    },
    comments: {
      addComment: "Add comment",
      threadTitle: "Comment",
      commentPlaceholder: "Add a comment…",
      replyPlaceholder: "Reply…",
      submitComment: "Comment",
      sendReply: "Send",
      loadingThread: "Loading thread…",
      unableToLoadThread: "Unable to load thread",
      closeComments: "Close comments",
      resolve: "Resolve",
      reopen: "Reopen",
      resolved: "Resolved",
      viewThread: "View thread",
      hideThread: "Hide thread",
      deleteComment: "Delete comment",
      deleted: "(deleted)",
      resolvedDescription: "This thread is resolved.",
      openCommentThread: "Open comment thread",
      you: "You",
      viewer: "Viewer",
    },
    nda: {
      processingTitle: "Processing your NDA",
      processingMessage:
        "We’re generating the signed NDA PDF. Please keep this tab open.",
      retrying: "Retrying...",
      signAgain: "Sign again",
      introTitle: "Non-Disclosure Agreement Required",
      verifyEmailTitle: "Verify Your Email",
      verifyEmailDescription:
        "We'll send a one-time code to confirm your identity before checking NDA status.",
      sendVerificationCode: "Send verification code",
      signTitle: "Sign the NDA",
      signDescription:
        "Confirm your details and provide a signature to proceed.",
      fullNameLabel: "Full name",
      fullNamePlaceholder: "Full name",
      emailLabel: "Email",
      emailPlaceholder: "Email",
      verificationCodePlaceholder: "Verification code",
      emailVerified: "Email verified.",
      agreementBetween: (workspaceName, fullName, resourcePlainName) =>
        `This agreement is between ${workspaceName} and ${fullName} in connection with ${resourcePlainName}. By signing you agree to keep the shared materials confidential.`,
      templateUnavailable:
        "NDA template is unavailable. Please contact the sender.",
      agreementPreview: "Agreement Preview",
      reviewBeforeSigning: "Review before signing",
      drawSignature: "Draw signature",
      typeSignature: "Type signature",
      selected: "Selected",
      drawSignatureHelp:
        "Use your mouse or trackpad to capture a handwritten signature.",
      clearSignature: "Clear",
      typeSignaturePlaceholder: "Start typing above...",
      acceptAndSign: "Accept & Sign",
      signing: "Signing...",
      enterFullName: "Please enter your full name.",
      provideSignature: "Please provide your signature (draw or type).",
      failedToSign: "Failed to sign NDA",
      introDescription: (
        workspaceName,
        resourceActionVerb,
        resourceQuotedName,
        resourcePlainName,
      ) =>
        workspaceName
          ? `Before you ${resourceActionVerb} ${resourceQuotedName}, please verify your email and sign the NDA for ${workspaceName}.`
          : `Before you ${resourceActionVerb} ${resourcePlainName}, please verify your email and sign the NDA.`,
    },
    emails: {
      linkOtpSubject: "Your DocKosha Verification Code",
      linkOtpTitle: "Your verification code",
      linkOtpPreheader: "Use this code to verify your email address.",
      linkOtpIntro: "Use this code to verify your email address.",
      linkOtpExpiry: (minutes) => `This code expires in ${minutes} minutes.`,
      linkInviteSubjectDocument: (resourceName) =>
        `You've been granted access to ${resourceName}`,
      linkInviteSubjectDataRoom: (resourceName) =>
        `You've been invited to ${resourceName}`,
      linkInviteTitleDocument: "Access granted",
      linkInviteTitleDataRoom: "You are invited",
      linkInvitePreheader: (resourceName) =>
        `Open ${resourceName} to review the latest materials.`,
      linkInviteIntroDocument: (resourceName) =>
        `You now have access to ${resourceName}.`,
      linkInviteIntroDataRoom: (resourceName) =>
        `You have been invited to ${resourceName}.`,
      linkInviteOpenLink: "Open link",
      linkInviteExpiry: (dateLabel) => `This link expires on ${dateLabel}.`,
      ndaSignedViewerSubject: (resourceTitle) => `NDA Signed: ${resourceTitle}`,
      ndaSignedViewerTitle: "NDA signed",
      ndaSignedViewerPreheader: (workspaceName) =>
        `Your NDA for ${workspaceName} is complete.`,
      ndaSignedViewerBody: (contextLabel, resourceTitle) =>
        `You have successfully signed the NDA for the ${contextLabel} ${resourceTitle}.`,
      ndaSignedViewerAttachment: "A copy of the signed NDA is attached.",
      commentReplySubject: (documentTitle) => `New reply: ${documentTitle}`,
      commentReplyTitle: "New reply",
      commentReplyPreheader: "Someone replied to your comment.",
      commentReplyBody: (replyAuthorEmail, documentTitle) =>
        `${replyAuthorEmail} replied to your comment on ${documentTitle}.`,
      commentReplyLine: (replyBody) => `Reply: ${replyBody}`,
      commentReplyOpenDocument: "Open document",
    },
  },
  fr: {
    metadata: {
      documentViewerTitle: "Visionneuse de document",
      documentViewerDescription: "Visionneuse publique sécurisée de document",
      dataRoomViewerTitle: "Visionneuse de data room",
      dataRoomViewerDescription: "Visionneuse publique sécurisée de data room",
      secureViewerLinkTitle: "Lien de visualisation sécurisé",
      secureViewerLinkDescription: "Lien public sécurisé de visualisation",
    },
    header: {
      sharedViaDocKosha: "Partagé via DocKosha",
      feedback: "Retour",
      giveFeedback: "Donner un retour",
      feedbackPlaceholder: "Partagez votre avis...",
      submitFeedback: "Envoyer le retour",
      comments: "Commentaires",
      hideComments: "Masquer les commentaires",
      showComments: "Afficher les commentaires",
      qAndA: "Q&R",
      frequentlyAskedQuestions: "Questions fréquentes",
      download: "Télécharger",
      verifiedWorkspace: "Espace vérifié",
      backToDataRoom: "Retour à la data room",
      poweredByDocKosha: "Propulsé par DocKosha",
    },
    common: {
      emailRequired: "L’adresse mail est obligatoire.",
      validEmailRequired: "Saisissez une adresse mail valide.",
      enterVerificationCode: "Saisissez le code de vérification",
      failedToSendCode: "Impossible d’envoyer le code",
      verificationFailed: "La vérification a échoué",
      unableToVerifyNdaStatus:
        "Impossible de vérifier le statut de l’accord de confidentialité",
      unableToOpenLink: "Impossible d’ouvrir le lien",
      incorrectPassword: "Mot de passe incorrect. Veuillez réessayer.",
      passwordRequired: "Le mot de passe est obligatoire.",
      linkUnavailable: "Lien indisponible",
      tryAgain: "Réessayer",
      tryDifferentAccount: "Essayer avec un autre compte",
      sending: "Envoi...",
      sendCode: "Envoyer le code",
      resendCode: "Renvoyer le code",
      resendIn: (seconds) => `Renvoyer dans ${seconds}s`,
      changeEmail: "Changer d’adresse mail",
      verify: "Vérifier",
      verifying: "Vérification...",
      checking: "Vérification en cours...",
      continue: "Continuer",
      change: "Changer",
      loadingDataRoom: "Chargement de votre espace sécurisé...",
      didntGetCode: "Vous n’avez pas reçu le code ?",
      contactLinkOwner:
        "Si vous pensez qu'il s'agit d'une erreur, contactez la personne qui vous a partagé ce lien.",
      contactSenderForHelp:
        "Si vous pensez qu'il s'agit d'une erreur, contactez l'expéditeur pour obtenir de l'aide.",
      close: "Fermer",
      cancel: "Annuler",
    },
    document: {
      emailVerificationRequired: "Vérification de l’adresse mail requise",
      verifyEmailToAccess: (resourceActionVerb, resourcePlainName) =>
        `Vérifiez votre adresse mail pour ${resourceActionVerb} ${resourcePlainName}.`,
      passwordProtectedLink: "Lien protégé par mot de passe",
      protectedDescription: (resourceActionVerb, resourcePlainName) =>
        `Saisissez le mot de passe pour ${resourceActionVerb} ${resourcePlainName}.`,
      unlock: "Déverrouiller",
      enterEmailPlaceholder: "Saisissez votre adresse mail…",
      enterCodePlaceholder: "Saisissez le code à 6 chiffres…",
      enterPasswordPlaceholder: "Saisissez le mot de passe…",
      verifyEmailToCommentTitle: "Vérifiez votre adresse mail pour commenter",
      verifyEmailToCommentDescription:
        "Vérifiez votre adresse mail pour ajouter un commentaire à ce document.",
      sendCommentCode: "Envoyer le code",
      commentEmailPlaceholder: "Saisissez votre adresse mail…",
      commentCodePlaceholder: "Saisissez le code à 6 chiffres…",
      documentResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "Ce lien de document est invalide ou a été révoqué.";
          case "EXPIRED":
            return "Ce lien de document a expiré.";
          case "REVOKED":
            return "Le propriétaire de l’espace a révoqué ce lien.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "Ce document ne peut être ouvert que depuis un domaine vérifié de l’espace.";
          case "EMAIL_OTP_REQUIRED":
            return "Ce lien nécessite une vérification par e-mail. Rechargez la page et vérifiez votre e-mail pour continuer.";
          case "ALC_NOT_ALLOWED":
            return "Vous n’avez pas l’autorisation d’accéder à ce document.";
          case "NDA_SIGN_REQUIRED":
            return "Vous devez signer l’accord de confidentialité avant de consulter ce document.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "Cet espace a atteint sa limite mensuelle de consultation.";
          default:
            return "Nous n’avons pas pu ouvrir ce document. Le lien est peut-être indisponible.";
        }
      },
      sharedDocumentFallback: "Document partagé",
      unableToDownload:
        "Impossible de télécharger le document pour le moment. Veuillez réessayer.",
      unableToPrint:
        "Impossible d’imprimer le document pour le moment. Veuillez réessayer.",
      allowPopupsToPrint:
        "Veuillez autoriser les fenêtres pop-up pour imprimer ce document.",
      commentActionFailed: "Impossible d’effectuer cette action de commentaire",
      commentSelectionFailed:
        "Impossible de créer un commentaire à partir de cette sélection. Veuillez sélectionner à nouveau le texte et réessayer.",
    },
    dataRoom: {
      protectedTitle: "Data room protégée",
      protectedDescription:
        "Saisissez le mot de passe fourni par le propriétaire de la data room pour continuer.",
      unlock: "Déverrouiller la data room",
      emailVerificationRequired: "Vérification de l’adresse mail requise",
      verifyEmailDescription:
        "Vérifiez votre adresse mail pour accéder à cet espace sécurisé.",
      dataRoomResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "Ce lien de data room est invalide ou a été révoqué.";
          case "EXPIRED":
            return "Ce lien de data room a expiré.";
          case "REVOKED":
            return "Le propriétaire de l’espace a révoqué ce lien.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "Ce lien ne peut être ouvert que depuis le domaine vérifié de l’espace.";
          case "EMAIL_OTP_REQUIRED":
            return "Ce lien nécessite une vérification par e-mail. Rechargez la page et vérifiez votre e-mail pour continuer.";
          case "ALC_NOT_ALLOWED":
            return "Vous n’avez pas l’autorisation d’accéder à cette data room.";
          case "NDA_SIGN_REQUIRED":
            return "Vous devez signer l’accord de confidentialité avant de consulter cet espace sécurisé.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "Ce lien a atteint sa limite de consultation. Veuillez contacter l’expéditeur pour obtenir l’accès.";
          default:
            return "Nous n’avons pas pu ouvrir cette data room. Le lien est peut-être indisponible.";
        }
      },
      browseFolders: "Parcourir les dossiers",
      browseSharedContent:
        "Parcourez les dossiers et documents partagés dans cet espace sécurisé.",
      viewingFolderContents: "Affichage du contenu de ce dossier.",
      downloadEntireDataRoomZip: "Télécharger toute la data room (.zip)",
      downloadThisFolderZip: "Télécharger ce dossier (.zip)",
      noFolderSelectedForDownload:
        "Aucun dossier sélectionné pour le téléchargement.",
      unableToDownloadZip:
        "Impossible de télécharger l’archive ZIP pour le moment. Veuillez réessayer.",
      foldersTitle: "Dossiers",
      noDocumentsYet:
        "Aucun document n’est encore disponible dans cette data room.",
      emptyFolder: "Ce dossier est vide.",
      name: "Nom",
      size: "Taille",
      actions: "Actions",
      empty: "Vide",
      fileCount: (count) => `${count} fichier${count > 1 ? "s" : ""}`,
      open: "Ouvrir",
      allDocuments: "Tous les documents",
      untitledFolder: "Dossier sans titre",
      untitledDocument: "Document sans titre",
    },
    comments: {
      addComment: "Ajouter un commentaire",
      threadTitle: "Commentaire",
      commentPlaceholder: "Ajouter un commentaire…",
      replyPlaceholder: "Répondre…",
      submitComment: "Commenter",
      sendReply: "Envoyer",
      loadingThread: "Chargement du fil…",
      unableToLoadThread: "Impossible de charger le fil",
      closeComments: "Fermer les commentaires",
      resolve: "Résoudre",
      reopen: "Rouvrir",
      resolved: "Résolu",
      viewThread: "Voir le fil",
      hideThread: "Masquer le fil",
      deleteComment: "Supprimer le commentaire",
      deleted: "(supprimé)",
      resolvedDescription: "Ce fil est résolu.",
      openCommentThread: "Ouvrir le fil de commentaires",
      you: "Vous",
      viewer: "Lecteur",
    },
    nda: {
      processingTitle: "Traitement de votre accord de confidentialité",
      processingMessage:
        "Nous générons le PDF signé de l’accord de confidentialité. Veuillez garder cet onglet ouvert.",
      retrying: "Nouvelle tentative...",
      signAgain: "Signer à nouveau",
      introTitle: "Accord de confidentialité requis",
      verifyEmailTitle: "Vérifiez votre adresse mail",
      verifyEmailDescription:
        "Nous enverrons un code à usage unique pour confirmer votre identité avant de vérifier le statut de l’accord de confidentialité.",
      sendVerificationCode: "Envoyer le code de vérification",
      signTitle: "Signer l’accord de confidentialité",
      signDescription:
        "Confirmez vos informations et fournissez une signature pour continuer.",
      fullNameLabel: "Nom complet",
      fullNamePlaceholder: "Nom complet",
      emailLabel: "Adresse mail",
      emailPlaceholder: "Adresse mail",
      verificationCodePlaceholder: "Code de vérification",
      emailVerified: "Adresse mail vérifiée.",
      agreementBetween: (workspaceName, fullName, resourcePlainName) =>
        `Le présent accord est conclu entre ${workspaceName} et ${fullName} au sujet de ${resourcePlainName}. En le signant, vous acceptez de garder les documents partagés confidentiels.`,
      templateUnavailable:
        "Le modèle d’accord de confidentialité est indisponible. Veuillez contacter l’expéditeur.",
      agreementPreview: "Aperçu de l’accord",
      reviewBeforeSigning: "Relire avant de signer",
      drawSignature: "Signer",
      typeSignature: "Saisir la signature",
      selected: "Sélectionné",
      drawSignatureHelp:
        "Utilisez votre souris ou votre pavé tactile pour saisir votre signature.",
      clearSignature: "Effacer",
      typeSignaturePlaceholder: "Commencez à taper ci-dessus...",
      acceptAndSign: "Accepter et signer",
      signing: "Signature...",
      enterFullName: "Veuillez saisir votre nom complet.",
      provideSignature:
        "Veuillez fournir votre signature (dessinée ou saisie).",
      failedToSign: "Échec de la signature de l’accord de confidentialité",
      introDescription: (
        workspaceName,
        resourceActionVerb,
        resourceQuotedName,
        resourcePlainName,
      ) =>
        workspaceName
          ? `Avant de ${resourceActionVerb} ${resourceQuotedName}, veuillez vérifier votre adresse mail et signer l’accord de confidentialité de ${workspaceName}.`
          : `Avant de ${resourceActionVerb} ${resourcePlainName}, veuillez vérifier votre adresse mail et signer l’accord de confidentialité.`,
    },
    emails: {
      linkOtpSubject: "Votre code de vérification DocKosha",
      linkOtpTitle: "Votre code de vérification",
      linkOtpPreheader: "Utilisez ce code pour vérifier votre adresse e-mail.",
      linkOtpIntro: "Utilisez ce code pour vérifier votre adresse e-mail.",
      linkOtpExpiry: (minutes) => `Ce code expire dans ${minutes} minutes.`,
      linkInviteSubjectDocument: (resourceName) =>
        `Vous avez reçu l’accès à ${resourceName}`,
      linkInviteSubjectDataRoom: (resourceName) =>
        `Vous êtes invité à ${resourceName}`,
      linkInviteTitleDocument: "Accès accordé",
      linkInviteTitleDataRoom: "Vous êtes invité",
      linkInvitePreheader: (resourceName) =>
        `Ouvrez ${resourceName} pour consulter les derniers documents.`,
      linkInviteIntroDocument: (resourceName) =>
        `Vous avez maintenant accès à ${resourceName}.`,
      linkInviteIntroDataRoom: (resourceName) =>
        `Vous avez été invité à ${resourceName}.`,
      linkInviteOpenLink: "Ouvrir le lien",
      linkInviteExpiry: (dateLabel) => `Ce lien expire le ${dateLabel}.`,
      ndaSignedViewerSubject: (resourceTitle) =>
        `Accord de confidentialité signé : ${resourceTitle}`,
      ndaSignedViewerTitle: "Accord de confidentialité signé",
      ndaSignedViewerPreheader: (workspaceName) =>
        `Votre accord de confidentialité pour ${workspaceName} est finalisé.`,
      ndaSignedViewerBody: (contextLabel, resourceTitle) =>
        `Vous avez signé avec succès l’accord de confidentialité pour le ${contextLabel} ${resourceTitle}.`,
      ndaSignedViewerAttachment:
        "Une copie de l’accord de confidentialité signé est jointe.",
      commentReplySubject: (documentTitle) =>
        `Nouvelle réponse : ${documentTitle}`,
      commentReplyTitle: "Nouvelle réponse",
      commentReplyPreheader: "Quelqu’un a répondu à votre commentaire.",
      commentReplyBody: (replyAuthorEmail, documentTitle) =>
        `${replyAuthorEmail} a répondu à votre commentaire sur ${documentTitle}.`,
      commentReplyLine: (replyBody) => `Réponse : ${replyBody}`,
      commentReplyOpenDocument: "Ouvrir le document",
    },
  },
  es: {
    metadata: {
      documentViewerTitle: "Visor de documentos",
      documentViewerDescription: "Visor público seguro de documentos",
      dataRoomViewerTitle: "Visor de data room",
      dataRoomViewerDescription: "Visor público seguro de data room",
      secureViewerLinkTitle: "Enlace de visor seguro",
      secureViewerLinkDescription: "Enlace público seguro del visor",
    },
    header: {
      sharedViaDocKosha: "Compartido vía DocKosha",
      feedback: "Comentarios",
      giveFeedback: "Enviar comentarios",
      feedbackPlaceholder: "Comparte tu opinión...",
      submitFeedback: "Enviar comentario",
      comments: "Comentarios",
      hideComments: "Ocultar comentarios",
      showComments: "Mostrar comentarios",
      qAndA: "Preguntas y respuestas",
      frequentlyAskedQuestions: "Preguntas frecuentes",
      download: "Descargar",
      verifiedWorkspace: "Workspace verificado",
      backToDataRoom: "Volver al data room",
      poweredByDocKosha: "Con tecnología de DocKosha",
    },
    common: {
      emailRequired: "El correo electrónico es obligatorio.",
      validEmailRequired: "Introduce un correo electrónico válido.",
      enterVerificationCode: "Introduce el código de verificación",
      failedToSendCode: "No se pudo enviar el código",
      verificationFailed: "La verificación ha fallado",
      unableToVerifyNdaStatus: "No se pudo verificar el estado del NDA",
      unableToOpenLink: "No se pudo abrir el enlace",
      incorrectPassword: "Contraseña incorrecta. Inténtalo de nuevo.",
      passwordRequired: "La contraseña es obligatoria.",
      linkUnavailable: "Enlace no disponible",
      tryAgain: "Intentar de nuevo",
      tryDifferentAccount: "Probar con otra cuenta",
      sending: "Enviando...",
      sendCode: "Enviar código",
      resendCode: "Reenviar código",
      resendIn: (seconds) => `Reenviar en ${seconds}s`,
      changeEmail: "Cambiar correo",
      verify: "Verificar",
      verifying: "Verificando...",
      checking: "Comprobando...",
      continue: "Continuar",
      change: "Cambiar",
      loadingDataRoom: "Cargando data room...",
      didntGetCode: "¿No recibiste el código?",
      contactLinkOwner:
        "Si crees que esto es un error, contacta con la persona que te compartió el enlace.",
      contactSenderForHelp:
        "Si crees que esto es un error, contacta con el remitente para obtener ayuda.",
      close: "Cerrar",
      cancel: "Cancelar",
    },
    document: {
      emailVerificationRequired: "Verificación de correo requerida",
      verifyEmailToAccess: (resourceActionVerb, resourcePlainName) =>
        `Verifica tu correo para ${resourceActionVerb} ${resourcePlainName}.`,
      passwordProtectedLink: "Enlace protegido por contraseña",
      protectedDescription: (resourceActionVerb, resourcePlainName) =>
        `Introduce la contraseña para ${resourceActionVerb} ${resourcePlainName}.`,
      unlock: "Desbloquear",
      enterEmailPlaceholder: "Introduce tu correo...",
      enterCodePlaceholder: "Introduce el código de 6 dígitos...",
      enterPasswordPlaceholder: "Introduce la contraseña...",
      verifyEmailToCommentTitle: "Verifica tu correo para comentar",
      verifyEmailToCommentDescription:
        "Verifica tu correo para crear un comentario en este documento.",
      sendCommentCode: "Enviar código",
      commentEmailPlaceholder: "Introduce tu correo...",
      commentCodePlaceholder: "Introduce el código de 6 dígitos...",
      documentResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "Este enlace del documento no es válido o fue revocado.";
          case "EXPIRED":
            return "Este enlace del documento ha caducado.";
          case "REVOKED":
            return "El propietario del workspace ha revocado este enlace.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "Este documento solo puede abrirse desde un dominio verificado del workspace.";
          case "EMAIL_OTP_REQUIRED":
            return "Este enlace requiere verificación por correo. Recarga la página y verifica tu correo para continuar.";
          case "ALC_NOT_ALLOWED":
            return "No tienes permiso para acceder a este documento.";
          case "NDA_SIGN_REQUIRED":
            return "Debes firmar el NDA antes de ver este documento.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "Este workspace ha alcanzado su límite mensual de visualización.";
          default:
            return "No hemos podido abrir este documento. El enlace puede no estar disponible.";
        }
      },
      sharedDocumentFallback: "Documento compartido",
      unableToDownload:
        "No se puede descargar el documento ahora mismo. Inténtalo de nuevo.",
      unableToPrint:
        "No se puede imprimir el documento ahora mismo. Inténtalo de nuevo.",
      allowPopupsToPrint:
        "Permite las ventanas emergentes para imprimir este documento.",
      commentActionFailed: "No se pudo completar la acción del comentario",
      commentSelectionFailed:
        "No se pudo iniciar un comentario desde esta selección. Vuelve a seleccionar el texto e inténtalo de nuevo.",
    },
    dataRoom: {
      protectedTitle: "Data room protegido",
      protectedDescription:
        "Introduce la contraseña proporcionada por el propietario del data room para continuar.",
      unlock: "Desbloquear data room",
      emailVerificationRequired: "Verificación de correo requerida",
      verifyEmailDescription:
        "Verifica tu correo para acceder a este data room.",
      dataRoomResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "Este enlace del data room no es válido o fue revocado.";
          case "EXPIRED":
            return "Este enlace del data room ha caducado.";
          case "REVOKED":
            return "El propietario del workspace ha revocado este enlace.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "Este enlace solo puede abrirse desde el dominio verificado del workspace.";
          case "EMAIL_OTP_REQUIRED":
            return "Este enlace requiere verificación por correo. Recarga la página y verifica tu correo para continuar.";
          case "ALC_NOT_ALLOWED":
            return "No tienes permiso para acceder a este data room.";
          case "NDA_SIGN_REQUIRED":
            return "Debes firmar el NDA antes de ver este data room.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "Este enlace ha alcanzado su límite de visualización. Ponte en contacto con el remitente para obtener acceso.";
          default:
            return "No hemos podido abrir este data room. El enlace puede no estar disponible.";
        }
      },
      browseFolders: "Explorar carpetas",
      browseSharedContent:
        "Explora las carpetas y documentos compartidos en este data room.",
      viewingFolderContents: "Viendo el contenido de esta carpeta.",
      downloadEntireDataRoomZip: "Descargar todo el data room (.zip)",
      downloadThisFolderZip: "Descargar esta carpeta (.zip)",
      noFolderSelectedForDownload:
        "No hay ninguna carpeta seleccionada para descargar.",
      unableToDownloadZip:
        "No se puede descargar el ZIP ahora mismo. Inténtalo de nuevo.",
      foldersTitle: "Carpetas",
      noDocumentsYet: "Todavía no hay documentos en este data room.",
      emptyFolder: "Esta carpeta está vacía.",
      name: "Nombre",
      size: "Tamaño",
      actions: "Acciones",
      empty: "Vacío",
      fileCount: (count) => `${count} archivo${count === 1 ? "" : "s"}`,
      open: "Abrir",
      allDocuments: "Todos los documentos",
      untitledFolder: "Carpeta sin título",
      untitledDocument: "Documento sin título",
    },
    comments: {
      addComment: "Agregar comentario",
      threadTitle: "Comentario",
      commentPlaceholder: "Agregar un comentario...",
      replyPlaceholder: "Responder...",
      submitComment: "Comentar",
      sendReply: "Enviar",
      loadingThread: "Cargando hilo...",
      unableToLoadThread: "No se pudo cargar el hilo",
      closeComments: "Cerrar comentarios",
      resolve: "Resolver",
      reopen: "Reabrir",
      resolved: "Resuelto",
      viewThread: "Ver hilo",
      hideThread: "Ocultar hilo",
      deleteComment: "Eliminar comentario",
      deleted: "(eliminado)",
      resolvedDescription: "Este hilo está resuelto.",
      openCommentThread: "Abrir hilo de comentarios",
      you: "Tú",
      viewer: "Lector",
    },
    nda: {
      processingTitle: "Procesando tu NDA",
      processingMessage:
        "Estamos generando el PDF firmado del NDA. Mantén esta pestaña abierta.",
      retrying: "Reintentando...",
      signAgain: "Firmar de nuevo",
      introTitle: "Se requiere acuerdo de confidencialidad",
      verifyEmailTitle: "Verifica tu correo",
      verifyEmailDescription:
        "Enviaremos un código de un solo uso para confirmar tu identidad antes de comprobar el estado del NDA.",
      sendVerificationCode: "Enviar código de verificación",
      signTitle: "Firmar el NDA",
      signDescription:
        "Confirma tus datos y proporciona una firma para continuar.",
      fullNameLabel: "Nombre completo",
      fullNamePlaceholder: "Nombre completo",
      emailLabel: "Correo",
      emailPlaceholder: "Correo",
      verificationCodePlaceholder: "Código de verificación",
      emailVerified: "Correo verificado.",
      agreementBetween: (workspaceName, fullName, resourcePlainName) =>
        `Este acuerdo es entre ${workspaceName} y ${fullName} en relación con ${resourcePlainName}. Al firmar aceptas mantener confidenciales los materiales compartidos.`,
      templateUnavailable:
        "La plantilla de NDA no está disponible. Ponte en contacto con el remitente.",
      agreementPreview: "Vista previa del acuerdo",
      reviewBeforeSigning: "Revisar antes de firmar",
      drawSignature: "Dibujar firma",
      typeSignature: "Escribir firma",
      selected: "Seleccionado",
      drawSignatureHelp:
        "Usa el ratón o el trackpad para capturar una firma manuscrita.",
      clearSignature: "Borrar",
      typeSignaturePlaceholder: "Empieza a escribir arriba...",
      acceptAndSign: "Aceptar y firmar",
      signing: "Firmando...",
      enterFullName: "Introduce tu nombre completo.",
      provideSignature: "Proporciona tu firma (dibujada o escrita).",
      failedToSign: "No se pudo firmar el NDA",
      introDescription: (
        workspaceName,
        resourceActionVerb,
        resourceQuotedName,
        resourcePlainName,
      ) =>
        workspaceName
          ? `Antes de ${resourceActionVerb} ${resourceQuotedName}, verifica tu correo y firma el NDA de ${workspaceName}.`
          : `Antes de ${resourceActionVerb} ${resourcePlainName}, verifica tu correo y firma el NDA.`,
    },
    emails: {
      linkOtpSubject: "Tu código de verificación de DocKosha",
      linkOtpTitle: "Tu código de verificación",
      linkOtpPreheader:
        "Usa este código para verificar tu dirección de correo.",
      linkOtpIntro: "Usa este código para verificar tu dirección de correo.",
      linkOtpExpiry: (minutes) => `Este código caduca en ${minutes} minutos.`,
      linkInviteSubjectDocument: (resourceName) =>
        `Se te ha concedido acceso a ${resourceName}`,
      linkInviteSubjectDataRoom: (resourceName) =>
        `Has sido invitado a ${resourceName}`,
      linkInviteTitleDocument: "Acceso concedido",
      linkInviteTitleDataRoom: "Has sido invitado",
      linkInvitePreheader: (resourceName) =>
        `Abre ${resourceName} para revisar los últimos materiales.`,
      linkInviteIntroDocument: (resourceName) =>
        `Ahora tienes acceso a ${resourceName}.`,
      linkInviteIntroDataRoom: (resourceName) =>
        `Has sido invitado a ${resourceName}.`,
      linkInviteOpenLink: "Abrir enlace",
      linkInviteExpiry: (dateLabel) => `Este enlace caduca el ${dateLabel}.`,
      ndaSignedViewerSubject: (resourceTitle) =>
        `NDA firmado: ${resourceTitle}`,
      ndaSignedViewerTitle: "NDA firmado",
      ndaSignedViewerPreheader: (workspaceName) =>
        `Tu NDA para ${workspaceName} está completo.`,
      ndaSignedViewerBody: (contextLabel, resourceTitle) =>
        `Has firmado correctamente el NDA para ${contextLabel} ${resourceTitle}.`,
      ndaSignedViewerAttachment: "Se adjunta una copia del NDA firmado.",
      commentReplySubject: (documentTitle) =>
        `Nueva respuesta: ${documentTitle}`,
      commentReplyTitle: "Nueva respuesta",
      commentReplyPreheader: "Alguien respondió a tu comentario.",
      commentReplyBody: (replyAuthorEmail, documentTitle) =>
        `${replyAuthorEmail} respondió a tu comentario en ${documentTitle}.`,
      commentReplyLine: (replyBody) => `Respuesta: ${replyBody}`,
      commentReplyOpenDocument: "Abrir documento",
    },
  },
  de: {
    metadata: {
      documentViewerTitle: "Dokumentenanzeige",
      documentViewerDescription: "Sichere öffentliche Dokumentenanzeige",
      dataRoomViewerTitle: "Datenraum-Anzeige",
      dataRoomViewerDescription: "Sichere öffentliche Datenraum-Anzeige",
      secureViewerLinkTitle: "Sicherer Viewer-Link",
      secureViewerLinkDescription:
        "Sicherer öffentlich freigegebener Viewer-Link",
    },
    header: {
      sharedViaDocKosha: "Geteilt über DocKosha",
      feedback: "Feedback",
      giveFeedback: "Feedback geben",
      feedbackPlaceholder: "Teile deine Gedanken...",
      submitFeedback: "Feedback senden",
      comments: "Kommentare",
      hideComments: "Kommentare ausblenden",
      showComments: "Kommentare anzeigen",
      qAndA: "Fragen und Antworten",
      frequentlyAskedQuestions: "Häufig gestellte Fragen",
      download: "Herunterladen",
      verifiedWorkspace: "Verifizierter Workspace",
      backToDataRoom: "Zurück zum Datenraum",
      poweredByDocKosha: "Bereitgestellt von DocKosha",
    },
    common: {
      emailRequired: "E-Mail ist erforderlich.",
      validEmailRequired: "Gib eine gültige E-Mail-Adresse ein.",
      enterVerificationCode: "Gib den Verifizierungscode ein",
      failedToSendCode: "Code konnte nicht gesendet werden",
      verificationFailed: "Verifizierung fehlgeschlagen",
      unableToVerifyNdaStatus: "NDA-Status konnte nicht überprüft werden",
      unableToOpenLink: "Link konnte nicht geöffnet werden",
      incorrectPassword: "Falsches Passwort. Bitte versuche es erneut.",
      passwordRequired: "Passwort ist erforderlich.",
      linkUnavailable: "Link nicht verfügbar",
      tryAgain: "Erneut versuchen",
      tryDifferentAccount: "Mit einem anderen Konto versuchen",
      sending: "Wird gesendet...",
      sendCode: "Code senden",
      resendCode: "Code erneut senden",
      resendIn: (seconds) => `Erneut senden in ${seconds}s`,
      changeEmail: "E-Mail ändern",
      verify: "Verifizieren",
      verifying: "Wird verifiziert...",
      checking: "Wird geprüft...",
      continue: "Weiter",
      change: "Ändern",
      loadingDataRoom: "Datenraum wird geladen...",
      didntGetCode: "Code nicht erhalten?",
      contactLinkOwner:
        "Wenn du glaubst, dass dies ein Fehler ist, kontaktiere die Person, die dir den Link geschickt hat.",
      contactSenderForHelp:
        "Wenn du glaubst, dass dies ein Fehler ist, kontaktiere den Absender, um Hilfe zu erhalten.",
      close: "Schließen",
      cancel: "Abbrechen",
    },
    document: {
      emailVerificationRequired: "E-Mail-Verifizierung erforderlich",
      verifyEmailToAccess: (resourceActionVerb, resourcePlainName) =>
        `Verifiziere deine E-Mail, um ${resourceActionVerb} ${resourcePlainName}.`,
      passwordProtectedLink: "Passwortgeschützter Link",
      protectedDescription: (resourceActionVerb, resourcePlainName) =>
        `Gib das Passwort ein, um ${resourceActionVerb} ${resourcePlainName}.`,
      unlock: "Entsperren",
      enterEmailPlaceholder: "Gib deine E-Mail ein...",
      enterCodePlaceholder: "6-stelligen Code eingeben...",
      enterPasswordPlaceholder: "Passwort eingeben...",
      verifyEmailToCommentTitle: "E-Mail zum Kommentieren verifizieren",
      verifyEmailToCommentDescription:
        "Verifiziere deine E-Mail, um einen Kommentar zu diesem Dokument zu erstellen.",
      sendCommentCode: "Code senden",
      commentEmailPlaceholder: "Gib deine E-Mail ein...",
      commentCodePlaceholder: "6-stelligen Code eingeben...",
      documentResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "Dieser Dokumentenlink ist ungültig oder wurde widerrufen.";
          case "EXPIRED":
            return "Dieser Dokumentenlink ist abgelaufen.";
          case "REVOKED":
            return "Der Workspace-Eigentümer hat diesen Link widerrufen.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "Dieses Dokument kann nur über eine verifizierte Workspace-Domain geöffnet werden.";
          case "EMAIL_OTP_REQUIRED":
            return "Dieser Link erfordert eine E-Mail-Verifizierung. Lade die Seite neu und verifiziere deine E-Mail, um fortzufahren.";
          case "ALC_NOT_ALLOWED":
            return "Du hast keine Berechtigung, auf dieses Dokument zuzugreifen.";
          case "NDA_SIGN_REQUIRED":
            return "Du musst das NDA unterschreiben, bevor du dieses Dokument ansehen kannst.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "Dieser Workspace hat sein monatliches Ansichtslimit erreicht.";
          default:
            return "Dieses Dokument konnte nicht geöffnet werden. Der Link ist möglicherweise nicht verfügbar.";
        }
      },
      sharedDocumentFallback: "Geteiltes Dokument",
      unableToDownload:
        "Das Dokument kann gerade nicht heruntergeladen werden. Bitte versuche es erneut.",
      unableToPrint:
        "Das Dokument kann gerade nicht gedruckt werden. Bitte versuche es erneut.",
      allowPopupsToPrint:
        "Bitte erlaube Pop-ups, um dieses Dokument zu drucken.",
      commentActionFailed: "Kommentaraktion konnte nicht abgeschlossen werden",
      commentSelectionFailed:
        "Von dieser Auswahl aus konnte kein Kommentar gestartet werden. Bitte wähle den Text erneut aus und versuche es noch einmal.",
    },
    dataRoom: {
      protectedTitle: "Geschützter Datenraum",
      protectedDescription:
        "Gib das vom Eigentümer des Datenraums bereitgestellte Passwort ein, um fortzufahren.",
      unlock: "Datenraum entsperren",
      emailVerificationRequired: "E-Mail-Verifizierung erforderlich",
      verifyEmailDescription:
        "Verifiziere deine E-Mail, um auf diesen Datenraum zuzugreifen.",
      dataRoomResolveError: (code) => {
        switch (code) {
          case "NOT_FOUND":
            return "Dieser Datenraum-Link ist ungültig oder wurde widerrufen.";
          case "EXPIRED":
            return "Dieser Datenraum-Link ist abgelaufen.";
          case "REVOKED":
            return "Der Workspace-Eigentümer hat diesen Link widerrufen.";
          case "INVALID_DOMAIN":
          case "INVALID_HOST":
            return "Dieser Link kann nur über die verifizierte Workspace-Domain geöffnet werden.";
          case "EMAIL_OTP_REQUIRED":
            return "Dieser Link erfordert eine E-Mail-Verifizierung. Lade die Seite neu und verifiziere deine E-Mail, um fortzufahren.";
          case "ALC_NOT_ALLOWED":
            return "Du hast keine Berechtigung, auf diesen Datenraum zuzugreifen.";
          case "NDA_SIGN_REQUIRED":
            return "Du musst das NDA unterschreiben, bevor du diesen Datenraum ansehen kannst.";
          case "BANDWIDTH_LIMIT_REACHED":
            return "Dieser Link hat sein Ansichtslimit erreicht. Bitte kontaktiere den Absender für Zugriff.";
          default:
            return "Dieser Datenraum konnte nicht geöffnet werden. Der Link ist möglicherweise nicht verfügbar.";
        }
      },
      browseFolders: "Ordner durchsuchen",
      browseSharedContent:
        "Durchsuche die freigegebenen Ordner und Dokumente in diesem Datenraum.",
      viewingFolderContents: "Inhalt dieses Ordners wird angezeigt.",
      downloadEntireDataRoomZip: "Gesamten Datenraum herunterladen (.zip)",
      downloadThisFolderZip: "Diesen Ordner herunterladen (.zip)",
      noFolderSelectedForDownload: "Kein Ordner für den Download ausgewählt.",
      unableToDownloadZip:
        "ZIP kann derzeit nicht heruntergeladen werden. Bitte versuche es erneut.",
      foldersTitle: "Ordner",
      noDocumentsYet:
        "In diesem Datenraum sind noch keine Dokumente vorhanden.",
      emptyFolder: "Dieser Ordner ist leer.",
      name: "Name",
      size: "Größe",
      actions: "Aktionen",
      empty: "Leer",
      fileCount: (count) => `${count} Datei${count === 1 ? "" : "en"}`,
      open: "Öffnen",
      allDocuments: "Alle Dokumente",
      untitledFolder: "Ordner ohne Titel",
      untitledDocument: "Dokument ohne Titel",
    },
    comments: {
      addComment: "Kommentar hinzufügen",
      threadTitle: "Kommentar",
      commentPlaceholder: "Kommentar hinzufügen...",
      replyPlaceholder: "Antworten...",
      submitComment: "Kommentieren",
      sendReply: "Senden",
      loadingThread: "Thread wird geladen...",
      unableToLoadThread: "Thread konnte nicht geladen werden",
      closeComments: "Kommentare schließen",
      resolve: "Lösen",
      reopen: "Erneut öffnen",
      resolved: "Gelöst",
      viewThread: "Thread anzeigen",
      hideThread: "Thread ausblenden",
      deleteComment: "Kommentar löschen",
      deleted: "(gelöscht)",
      resolvedDescription: "Dieser Thread ist gelöst.",
      openCommentThread: "Kommentar-Thread öffnen",
      you: "Du",
      viewer: "Betrachter",
    },
    nda: {
      processingTitle: "Dein NDA wird verarbeitet",
      processingMessage:
        "Wir erstellen die signierte NDA-PDF. Bitte lass diesen Tab geöffnet.",
      retrying: "Erneuter Versuch...",
      signAgain: "Erneut unterschreiben",
      introTitle: "Vertraulichkeitsvereinbarung erforderlich",
      verifyEmailTitle: "Verifiziere deine E-Mail",
      verifyEmailDescription:
        "Wir senden einen Einmalcode, um deine Identität zu bestätigen, bevor wir den NDA-Status prüfen.",
      sendVerificationCode: "Verifizierungscode senden",
      signTitle: "NDA unterschreiben",
      signDescription:
        "Bestätige deine Angaben und gib eine Unterschrift an, um fortzufahren.",
      fullNameLabel: "Vollständiger Name",
      fullNamePlaceholder: "Vollständiger Name",
      emailLabel: "E-Mail",
      emailPlaceholder: "E-Mail",
      verificationCodePlaceholder: "Verifizierungscode",
      emailVerified: "E-Mail verifiziert.",
      agreementBetween: (workspaceName, fullName, resourcePlainName) =>
        `Diese Vereinbarung wird zwischen ${workspaceName} und ${fullName} im Zusammenhang mit ${resourcePlainName} geschlossen. Mit deiner Unterschrift stimmst du zu, die geteilten Materialien vertraulich zu behandeln.`,
      templateUnavailable:
        "NDA-Vorlage ist nicht verfügbar. Bitte kontaktiere den Absender.",
      agreementPreview: "Vorschau der Vereinbarung",
      reviewBeforeSigning: "Vor dem Unterschreiben prüfen",
      drawSignature: "Unterschrift zeichnen",
      typeSignature: "Unterschrift eingeben",
      selected: "Ausgewählt",
      drawSignatureHelp:
        "Verwende Maus oder Trackpad, um eine handschriftliche Unterschrift zu erfassen.",
      clearSignature: "Löschen",
      typeSignaturePlaceholder: "Oben mit dem Tippen beginnen...",
      acceptAndSign: "Akzeptieren und unterschreiben",
      signing: "Wird unterschrieben...",
      enterFullName: "Bitte gib deinen vollständigen Namen ein.",
      provideSignature:
        "Bitte gib deine Unterschrift an (zeichnen oder tippen).",
      failedToSign: "NDA konnte nicht unterschrieben werden",
      introDescription: (
        workspaceName,
        resourceActionVerb,
        resourceQuotedName,
        resourcePlainName,
      ) =>
        workspaceName
          ? `Bevor du ${resourceActionVerb} ${resourceQuotedName}, verifiziere bitte deine E-Mail und unterschreibe das NDA für ${workspaceName}.`
          : `Bevor du ${resourceActionVerb} ${resourcePlainName}, verifiziere bitte deine E-Mail und unterschreibe das NDA.`,
    },
    emails: {
      linkOtpSubject: "Dein DocKosha-Verifizierungscode",
      linkOtpTitle: "Dein Verifizierungscode",
      linkOtpPreheader:
        "Verwende diesen Code, um deine E-Mail-Adresse zu verifizieren.",
      linkOtpIntro:
        "Verwende diesen Code, um deine E-Mail-Adresse zu verifizieren.",
      linkOtpExpiry: (minutes) => `Dieser Code läuft in ${minutes} Minuten ab.`,
      linkInviteSubjectDocument: (resourceName) =>
        `Dir wurde Zugriff auf ${resourceName} gewährt`,
      linkInviteSubjectDataRoom: (resourceName) =>
        `Du wurdest zu ${resourceName} eingeladen`,
      linkInviteTitleDocument: "Zugriff gewährt",
      linkInviteTitleDataRoom: "Du bist eingeladen",
      linkInvitePreheader: (resourceName) =>
        `Öffne ${resourceName}, um die neuesten Unterlagen zu prüfen.`,
      linkInviteIntroDocument: (resourceName) =>
        `Du hast jetzt Zugriff auf ${resourceName}.`,
      linkInviteIntroDataRoom: (resourceName) =>
        `Du wurdest zu ${resourceName} eingeladen.`,
      linkInviteOpenLink: "Link öffnen",
      linkInviteExpiry: (dateLabel) => `Dieser Link läuft am ${dateLabel} ab.`,
      ndaSignedViewerSubject: (resourceTitle) =>
        `NDA unterschrieben: ${resourceTitle}`,
      ndaSignedViewerTitle: "NDA unterschrieben",
      ndaSignedViewerPreheader: (workspaceName) =>
        `Dein NDA für ${workspaceName} ist abgeschlossen.`,
      ndaSignedViewerBody: (contextLabel, resourceTitle) =>
        `Du hast das NDA für ${contextLabel} ${resourceTitle} erfolgreich unterschrieben.`,
      ndaSignedViewerAttachment:
        "Eine Kopie des unterschriebenen NDA ist angehängt.",
      commentReplySubject: (documentTitle) => `Neue Antwort: ${documentTitle}`,
      commentReplyTitle: "Neue Antwort",
      commentReplyPreheader: "Jemand hat auf deinen Kommentar geantwortet.",
      commentReplyBody: (replyAuthorEmail, documentTitle) =>
        `${replyAuthorEmail} hat auf deinen Kommentar zu ${documentTitle} geantwortet.`,
      commentReplyLine: (replyBody) => `Antwort: ${replyBody}`,
      commentReplyOpenDocument: "Dokument öffnen",
    },
  },
};

const PUBLIC_LANGUAGE_TAGS: Record<PublicLanguage, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
};

export const getPublicMessages = (
  language: PublicLanguage = DEFAULT_PUBLIC_LANGUAGE,
): PublicMessages => dictionaries[language] ?? dictionaries.en;

const getPublicLanguageTag = (
  language: PublicLanguage = DEFAULT_PUBLIC_LANGUAGE,
): string => {
  return PUBLIC_LANGUAGE_TAGS[language] ?? PUBLIC_LANGUAGE_TAGS.en;
};

export const formatPublicDate = (
  value: Date,
  language: PublicLanguage = DEFAULT_PUBLIC_LANGUAGE,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
): string => {
  return new Intl.DateTimeFormat(
    getPublicLanguageTag(language),
    options,
  ).format(value);
};
