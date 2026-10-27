import { useState } from "react";

import { profilePictureSource } from "../services/profileService";

function Avatar({ name, src, className = "" }) {
  const [failedSource, setFailedSource] = useState("");
  const imageSource = profilePictureSource(src);

  const initials = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  return (
    <span className={`avatar ${className}`.trim()} aria-label={name || "Profile"}>
      {imageSource && failedSource !== imageSource ? (
        <img src={imageSource} alt="" onError={() => setFailedSource(imageSource)} />
      ) : initials}
    </span>
  );
}

export default Avatar;
