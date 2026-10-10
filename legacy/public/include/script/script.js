//Function to diplay the new profile picture
let profilePicture = document.getElementById("image_profile_pic");
let newProfilePicture = document.getElementById("input_profile_picture");

newProfilePicture.onchange = function () {
  profilePicture.src = URL.createObjectURL(newProfilePicture.files[0]);
};
// $("#category").change(function () {
//   var value = $(this).val();
//   if (value === "other") {
//     $("#otherCat").removeAttr("hidden");
//   } else {
//     $("#otherCat").attr("hidden", true);
//   }
// });
// $("#duration").change(function () {
//   var value = $(this).val();
//   if (value === "setDuration") {
//     $(".setDuration").removeAttr("hidden");
//   } else {
//     $(".setDuration").attr("hidden", true);
//   }
// });
$("#category").change(function () {
  var value = $(this).val();
  if (value === "other") {
    $("#otherCat").fadeIn(1000);
  } else {
    $("#otherCat").fadeOut(1000);
  }
});

$("#duration").change(function () {
  var value = $(this).val();
  if (value === "setDuration") {
    $(".setDuration").fadeIn(1000);
  } else {
    $(".setDuration").fadeOut(1000);
  }
});
$("#uploadCourse").click(function () {
  alert("The course has been successfully uploaded");
  window.location.href = "courses.html";
});
// $("#category").on("change", function () {
//   var value = $(this).val();
//   if (value === "other") {
//     $("#otherCat").removeAttr("hidden");
//   } else {
//     $("#otherCat").attr("hidden", true); // Optional: hide again if not 'other'
//   }
// });
