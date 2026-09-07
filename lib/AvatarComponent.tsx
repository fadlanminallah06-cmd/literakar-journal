import React from "react";

interface AvatarProps {
  gender?: string;
  name?: string;
  className?: string;
}

/**
 * Avatar komponen yang menampilkan ikon profil berdasarkan gender
 * - Laki-laki: gambar ikon khusus (siswa.png)
 * - Perempuan: gambar ikon khusus (siswi.png)
 * - Default: inisial dari nama
 */
export const Avatar: React.FC<AvatarProps> = ({
  gender,
  name = "S",
  className = "w-12 h-12",
}) => {
  // Normalisasi gender value
  const normalizedGender = gender?.toLowerCase().trim();
  const isMale =
    normalizedGender === "laki-laki" ||
    normalizedGender === "male" ||
    normalizedGender === "l";
  const isFemale =
    normalizedGender === "perempuan" ||
    normalizedGender === "female" ||
    normalizedGender === "p";

  // Ambil inisial dari nama
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  if (isMale) {
    return (
      <div className={`${className} rounded-full overflow-hidden bg-blue-100 flex-shrink-0`}>
        <img
          src="/avatars/siswa.png"
          alt="Profil Laki-laki"
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback ke inisial jika gambar tidak ditemukan
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = "flex";
            }
          }}
        />
        <div className="hidden w-full h-full flex items-center justify-center bg-blue-100 text-blue-700 font-bold">
          {initials}
        </div>
      </div>
    );
  }

  if (isFemale) {
    return (
      <div className={`${className} rounded-full overflow-hidden bg-pink-100 flex-shrink-0`}>
        <img
          src="/avatars/siswi.png"
          alt="Profil Perempuan"
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback ke inisial jika gambar tidak ditemukan
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = "flex";
            }
          }}
        />
        <div className="hidden w-full h-full flex items-center justify-center bg-pink-100 text-pink-700 font-bold">
          {initials}
        </div>
      </div>
    );
  }

  // Default: tampilkan inisial dengan warna netral
  return (
    <div
      className={`${className} rounded-full overflow-hidden bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold`}
    >
      {initials}
    </div>
  );
};

export default Avatar;
